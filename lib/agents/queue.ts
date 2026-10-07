import type { AgentTask } from "../agent-ops/task-store";

/** A task deferred to the end of quiet hours is not runnable yet. */
export const isWaiting = (task: AgentTask, now: number): boolean => task.notBefore !== undefined && Date.parse(task.notBefore) > now;

/** The runner's 2 slots serve isolated runs only; legacy tasks without a target are isolated. */
export const selectIsolatedTasks = (queued: readonly AgentTask[], isPaused: (agent?: string) => boolean = () => false, now = Date.now()): AgentTask[] =>
  queued.filter((task) => task.target !== "thread" && !isPaused(task.agent ?? task.profile) && !isWaiting(task, now));

/**
 * D12: one event at a time per agent, oldest first, never while the thread runs (a user turn, or
 * a thread task of this agent). `isThreadBusy` asks the live wrapper; the selector is a snapshot,
 * so lib/agents/thread-run.ts waits for idle again right before it sends.
 */
export function selectThreadTasks(queued: readonly AgentTask[], all: readonly AgentTask[], isThreadBusy: (agent: string) => boolean, isPaused: (agent?: string) => boolean = () => false, now = Date.now()): AgentTask[] {
  const busy = new Set(all.filter((task) => task.status === "running" && task.target === "thread" && task.agent).map((task) => task.agent!));
  const picked: AgentTask[] = [];
  for (const task of [...queued].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (task.target !== "thread" || !task.agent || busy.has(task.agent) || isPaused(task.agent) || isWaiting(task, now)) continue;
    busy.add(task.agent);
    if (!isThreadBusy(task.agent)) picked.push(task);
  }
  return picked;
}
