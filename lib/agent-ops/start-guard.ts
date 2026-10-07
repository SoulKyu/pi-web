import { readAgentOpsSettings, isPausedFor, type AgentOpsSettings } from "./settings";
import { getTask, TERMINAL, type AgentTask } from "./task-store";

/** Right before an isolated prompt is sent: a pause may have cancelled the task while its session was starting. */
export function assertTaskStillStartable(
  task: AgentTask,
  deps: { readTask: (id: string) => AgentTask | null; readSettings: () => AgentOpsSettings } = { readTask: getTask, readSettings: readAgentOpsSettings },
): void {
  const current = deps.readTask(task.id);
  if (!current || TERMINAL.has(current.status)) throw new Error(`task ${current?.status ?? "removed"} while starting`);
  if (isPausedFor(deps.readSettings(), task.agent ?? task.profile)) throw new Error("agent paused");
}
