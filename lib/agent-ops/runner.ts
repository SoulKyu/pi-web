import { attachSession, claimTask, getTask, listTasks, releaseClaim, TERMINAL, updateTask, type AgentTask } from "./task-store";

export type RunOutcome = { status: "completed"; result?: string } | { status: "cancelled" };
export interface RunHandle {
  sessionId: string;
  /** Resolves on prompt_done (completed, or cancelled on stopReason "aborted"); rejects on
   *  prompt_error, stopReason "error", or a preflight rejection of the prompt send. */
  done: Promise<RunOutcome>;
  abort(): Promise<void>;
}
export interface RunnerDeps {
  start(task: AgentTask): Promise<RunHandle>;
  maxConcurrent: number;
  /** A run with no answer (e.g. an unanswered extension dialog) must not hold a slot forever. */
  maxRunMs?: number;
}
export const DEFAULT_MAX_RUN_MS = 30 * 60_000;

// Process-wide running counter — same globalThis pattern as __piSessions (lib/rpc-manager.ts:1934).
declare global { var __agentOpsRunning: number | undefined; }
function runningCount(): number { return globalThis.__agentOpsRunning ?? 0; }

export async function runPendingTasks(deps: RunnerDeps): Promise<void> {
  const capacity = deps.maxConcurrent - runningCount();
  if (capacity <= 0) return;
  // listTasks is newest first (the UI relies on it); dequeue oldest first so steady ingestion cannot starve old tasks.
  const queued = listTasks().filter((t) => t.status === "queued").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const batch = queued.slice(0, capacity);
  await Promise.all(batch.map((task) => runOne(task, deps)));
}

class RunTimeoutError extends Error {}

async function runOne(task: AgentTask, deps: RunnerDeps): Promise<void> {
  try {
    if (!claimTask(task.id)) return; // lost the race to another process/runner
  } catch { return; } // claimTask released its lock; the task stays queued for the next pass
  globalThis.__agentOpsRunning = runningCount() + 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let starting: Promise<RunHandle> | undefined;
  let handle: RunHandle | undefined;
  try {
    // One deadline for the whole run, start included: a start stuck in preflight or an MCP wait has no handle to abort.
    const maxRunMs = deps.maxRunMs ?? DEFAULT_MAX_RUN_MS;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RunTimeoutError(`timeout after ${maxRunMs} ms`)), maxRunMs);
    });
    starting = deps.start(task);
    handle = await Promise.race([starting, deadline]);
    handle.done.catch(() => {}); // observed now: a late rejection after a racing cancel stays handled
    attachSession(task.id, handle.sessionId); // never throws, even on a terminal task
    const current = getTask(task.id);
    if (current && TERMINAL.has(current.status)) {
      // Cancelled while the session was starting: the route had no session to abort yet.
      await handle.abort().catch(() => {});
      return;
    }
    const outcome = await Promise.race([handle.done, deadline]);
    finish(task.id, outcome.status === "cancelled" ? { status: "cancelled" } : { status: "completed", result: outcome.result });
  } catch (error) {
    // A concurrent cancel may already have written a terminal status.
    // Never throw from this catch: runOne runs fire-and-forget.
    finish(task.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    if (error instanceof RunTimeoutError) {
      if (handle) await handle.abort().catch(() => {});
      else abortLateSession(starting);
    }
  } finally {
    clearTimeout(timer);
    releaseClaim(task.id);
    globalThis.__agentOpsRunning = runningCount() - 1;
  }
}

/** The deadline won while start was pending: abort the session if it still comes up, swallow every rejection. */
function abortLateSession(starting: Promise<RunHandle> | undefined): void {
  starting?.then((late) => { late.done.catch(() => {}); return late.abort(); }, () => {}).catch(() => {});
}

/** Terminal-safe write: re-reads the status, skips if a racing writer already finished. */
function finish(id: string, patch: Partial<AgentTask>): void {
  try {
    const current = getTask(id);
    if (!current || TERMINAL.has(current.status)) return;
    updateTask(id, { ...patch, completedAt: new Date().toISOString() });
  } catch { /* a racing writer won; the task already has a terminal status */ }
}
