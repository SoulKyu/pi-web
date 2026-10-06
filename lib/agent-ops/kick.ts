import { getLongTermAgent } from "../agents/registry";
import { selectIsolatedTasks, selectThreadTasks } from "../agents/queue";
import { startThreadEventRun } from "../agents/thread-run";
import { getRpcSession, isRpcSessionStarting } from "../rpc-manager";
import { runPendingTasks } from "./runner";
import { startAgentProfileRun } from "./spawn";
import { recoverInterrupted, type AgentTask } from "./task-store";
import { triggerRunPin } from "./trigger-store";

declare global { var __agentOpsRecovered: boolean | undefined; }

const log = (error: unknown) => console.error("[agent-ops] runner failed:", error instanceof Error ? error.message : error);

/** Once per process, on first access of the task routes: fail the runs a dead process left behind, then drain the queue. */
export function recoverOnce(): void {
  if (globalThis.__agentOpsRecovered) return;
  globalThis.__agentOpsRecovered = true;
  try { recoverInterrupted(); } catch (error) { console.error("[agent-ops] recovery failed:", error instanceof Error ? error.message : error); }
  void kickRunner();
}

function isThreadBusy(agentName: string): boolean {
  const sessionId = getLongTermAgent(agentName)?.threadSessionId;
  if (!sessionId) return false;
  if (isRpcSessionStarting(sessionId)) return true;
  const live = getRpcSession(sessionId);
  return Boolean(live?.isAlive() && live.isRunning());
}

/** After a terminal write. Task 19 adds the failure push, Task 21 the webhook summary card. */
export function handleTaskEnd(task: AgentTask): void {
  void task;
}

/** Single runner entry point: the task route, the webhook and the scheduler all call it.
 *  A finished run re-kicks, so a freed slot never idles until the next external kick.
 *  Isolated runs keep the 2 slots; thread events run one per agent. */
export function kickRunner(): Promise<void> {
  const isolated = runPendingTasks({
    maxConcurrent: 2, slotKey: "__agentOpsRunning", select: selectIsolatedTasks,
    start: (task) => startAgentProfileRun(task.profile, task.cwd, task.prompt, triggerRunPin(task)),
    onRunEnd: () => void kickRunner(), onTaskEnd: handleTaskEnd,
  });
  const thread = runPendingTasks({
    maxConcurrent: Number.POSITIVE_INFINITY, slotKey: "__agentOpsThreadRunning",
    select: (queued, all) => selectThreadTasks(queued, all, isThreadBusy),
    start: startThreadEventRun, onRunEnd: () => void kickRunner(), onTaskEnd: handleTaskEnd,
  });
  return Promise.all([isolated, thread]).then(() => undefined, log);
}
