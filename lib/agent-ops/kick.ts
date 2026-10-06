import { runPendingTasks } from "./runner";
import { startAgentProfileRun } from "./spawn";
import { recoverInterrupted } from "./task-store";
import { triggerRunPin } from "./trigger-store";

declare global { var __agentOpsRecovered: boolean | undefined; }

/** Once per process, on first access of the task routes: fail the runs a dead process left behind, then drain the queue. */
export function recoverOnce(): void {
  if (globalThis.__agentOpsRecovered) return;
  globalThis.__agentOpsRecovered = true;
  try { recoverInterrupted(); } catch (error) { console.error("[agent-ops] recovery failed:", error instanceof Error ? error.message : error); }
  void kickRunner();
}

/** Single runner entry point: the task route, the webhook and the scheduler all call it.
 *  A finished run re-kicks, so a freed slot never idles until the next external kick. */
export function kickRunner(): Promise<void> {
  return runPendingTasks({
    maxConcurrent: 2,
    start: (task) => startAgentProfileRun(task.profile, task.cwd, task.prompt, triggerRunPin(task)),
    onRunEnd: () => void kickRunner(),
  }).catch((error) => console.error("[agent-ops] runner failed:", error instanceof Error ? error.message : error));
}
