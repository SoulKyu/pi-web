import { appendRunRecord, type RunRecord } from "./run-registry";
import { EMPTY_RUN_USAGE, type RunUsage } from "./run-usage";
import { attachSession, claimTask, getTask, listTasks, releaseClaim, TERMINAL, updateTask, type AgentTask } from "./task-store";

export type RunOutcome = { status: "completed"; result?: string } | { status: "cancelled" };
export interface RunHandle {
  sessionId: string;
  /** Resolves on prompt_done (completed, or cancelled on stopReason "aborted"); rejects on
   *  prompt_error, stopReason "error", or a preflight rejection of the prompt send. */
  done: Promise<RunOutcome>;
  abort(): Promise<void>;
  /** Usage counted so far from this run's own events. */
  usage?(): RunUsage;
}
export interface RunnerDeps {
  start(task: AgentTask): Promise<RunHandle>;
  maxConcurrent: number;
  /** A run with no answer (e.g. an unanswered extension dialog) must not hold a slot forever. */
  maxRunMs?: number;
  /** Called after a run ends and its slot is free, so the caller can start the next queued task. */
  onRunEnd?: () => void;
  /** Which queued tasks this runner may start now, oldest first. Default: every queued task. */
  select?(queued: AgentTask[], all: AgentTask[]): AgentTask[];
  /** The process-wide counter this runner's slots live in; two runners never share one. */
  slotKey?: "__agentOpsRunning" | "__agentOpsThreadRunning";
  /** Called with the final record after the terminal write, in the run's finally. */
  onTaskEnd?(task: AgentTask): void;
  /** Free runs allowed now across runners; the lower of this and `maxConcurrent` minus this runner's slots wins. */
  capacity?: () => number;
}
export const DEFAULT_MAX_RUN_MS = 30 * 60_000;

// Process-wide running counter — same globalThis pattern as __piSessions (lib/rpc-manager.ts:1934).
declare global { var __agentOpsRunning: number | undefined; var __agentOpsThreadRunning: number | undefined; }
type SlotKey = NonNullable<RunnerDeps["slotKey"]>;
export const runningCount = (key: SlotKey): number => globalThis[key] ?? 0;

export async function runPendingTasks(deps: RunnerDeps): Promise<void> {
  const key = deps.slotKey ?? "__agentOpsRunning";
  // ponytail: both passes read the capacity before incrementing, so a brief overshoot of one run is possible; the 60 s re-kick settles it.
  const own = deps.maxConcurrent - runningCount(key);
  const capacity = deps.capacity ? Math.min(deps.capacity(), own) : own;
  if (capacity <= 0) return;
  // listTasks is newest first (the UI relies on it); dequeue oldest first so steady ingestion cannot starve old tasks.
  const all = listTasks();
  const queued = all.filter((t) => t.status === "queued").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const batch = (deps.select ? deps.select(queued, all) : queued).slice(0, capacity);
  await Promise.all(batch.map((task) => runOne(task, deps, key)));
}

class RunTimeoutError extends Error {}

async function runOne(task: AgentTask, deps: RunnerDeps, key: SlotKey): Promise<void> {
  try {
    if (!claimTask(task.id)) return; // lost the race to another process/runner
  } catch { return; } // claimTask released its lock; the task stays queued for the next pass
  globalThis[key] = runningCount(key) + 1;
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
      void handle.abort().catch(() => {});
      recordRun(task, handle, current.status as RunRecord["status"]);
      return;
    }
    const outcome = await Promise.race([handle.done, deadline]);
    finish(task, handle, outcome.status === "cancelled" ? { status: "cancelled" } : { status: "completed", result: outcome.result });
  } catch (error) {
    // A concurrent cancel may already have written a terminal status.
    // Never throw from this catch: runOne runs fire-and-forget.
    finish(task, handle, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    if (error instanceof RunTimeoutError) {
      if (handle) void handle.abort().catch(() => {});
      else abortLateSession(starting);
    }
  } finally {
    clearTimeout(timer);
    releaseClaim(task.id);
    globalThis[key] = runningCount(key) - 1;
    const final = getTask(task.id);
    if (final && TERMINAL.has(final.status)) { try { deps.onTaskEnd?.(final); } catch { /* a finally must not throw */ } }
    try { deps.onRunEnd?.(); } catch { /* a finally must not throw: runOne runs fire-and-forget */ }
  }
}

/** The deadline won while start was pending: abort the session if it still comes up, swallow every rejection.
 *  Like every abort in this file it is fire-and-forget: its answer is never used, and a hung abort must not hold a slot. */
function abortLateSession(starting: Promise<RunHandle> | undefined): void {
  starting?.then((late) => { late.done.catch(() => {}); return late.abort(); }, () => {}).catch(() => {});
}

/** Terminal-safe write: re-reads the status, skips if a racing writer already finished. Either way the run is recorded. */
function finish(task: AgentTask, handle: RunHandle | undefined, patch: Partial<AgentTask> & { status: RunRecord["status"] }): void {
  const usage = handle?.usage?.() ?? EMPTY_RUN_USAGE;
  let status = patch.status;
  try {
    const current = getTask(task.id);
    if (current && TERMINAL.has(current.status)) status = current.status as RunRecord["status"];
    else if (current) updateTask(task.id, { ...patch, usage, completedAt: new Date().toISOString() });
  } catch { /* a racing writer won; the task already has a terminal status */ }
  recordRun(task, handle, status, usage);
}

function recordRun(task: AgentTask, handle: RunHandle | undefined, status: RunRecord["status"], usage = handle?.usage?.() ?? EMPTY_RUN_USAGE): void {
  appendRunRecord({
    ts: new Date().toISOString(), agent: task.agent, origin: task.origin, kind: task.kind, target: task.target,
    triggerId: task.triggerId, taskId: task.id, sessionId: handle?.sessionId, status,
    durationMs: Date.now() - Date.parse(getTask(task.id)?.startedAt ?? task.createdAt), usage, billing: "unknown",
  });
}
