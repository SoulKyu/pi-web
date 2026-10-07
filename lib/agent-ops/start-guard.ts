import { readAgentOpsSettings, isPausedFor, type AgentOpsSettings } from "./settings";
import { triggerBudgetRefusal } from "./budget-gate";
import { getTask, TERMINAL, type AgentTask } from "./task-store";

/** Right before an isolated prompt is sent: a pause may have cancelled the task while its session was starting. */
export function assertTaskStillStartable(
  task: AgentTask,
  deps: { readTask: (id: string) => AgentTask | null; readSettings: () => AgentOpsSettings; budgetRefusal?: (task: AgentTask) => string | null } = { readTask: getTask, readSettings: readAgentOpsSettings },
): void {
  const current = deps.readTask(task.id);
  if (!current || TERMINAL.has(current.status)) throw new Error(`task ${current?.status ?? "removed"} while starting`);
  if (isPausedFor(deps.readSettings(), task.agent ?? task.profile)) throw new Error("agent paused");
  const overBudget = (deps.budgetRefusal ?? triggerBudgetRefusal)(task); // a trigger task admitted earlier (deferred overnight) must not outlive the daily budget
  if (overBudget) throw new Error(overBudget);
}
