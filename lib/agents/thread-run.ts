import { watchPromptRun, type PromptRunSession } from "../agent-ops/prompt-run";
import type { RunHandle } from "../agent-ops/runner";
import { getTask, TERMINAL, type AgentTask } from "../agent-ops/task-store";
import { triggerBudgetRefusal } from "../agent-ops/budget-gate";
import { isPausedFor, readAgentOpsSettings } from "../agent-ops/settings";
import { reminderAuditLine, reminderPrompt } from "./agent-remind";
import { appendAuditSafe, type AuditLine } from "./audit";
import { AGENT_EVENT_ENTRY_TYPE, buildScheduleEvent, buildTaskEvent, type AgentEventData } from "./events";
import { getLongTermAgent, type LongTermAgent } from "./registry";
import { openThread } from "./thread";

export interface ThreadSessionLike extends PromptRunSession { isRunning(): boolean; appendDisplayEntry(customType: string, data: unknown): string }
export interface ThreadRunDeps { open: (agent: LongTermAgent) => Promise<{ session: ThreadSessionLike; sessionId: string }>; readAgent: typeof getLongTermAgent; readTask: typeof getTask; budgetRefusal?: (task: AgentTask) => string | null; audit?: (agent: string, line: AuditLine) => void }
const defaultDeps = (): ThreadRunDeps => ({ open: openThread, readAgent: getLongTermAgent, readTask: getTask });

export function eventOfTask(task: AgentTask): AgentEventData {
  return task.kind === "schedule" && task.triggerId
    ? buildScheduleEvent({ taskId: task.id, triggerId: task.triggerId, title: task.title, fireReason: task.fireReason })
    : buildTaskEvent({ taskId: task.id, title: task.title, requestedBy: task.requestedBy, handedFrom: task.requestedBy === "user" ? task.deliverTo : undefined });
}

/**
 * The selector saw an idle thread, but a user turn may have started since. watchPromptRun settles
 * on the first prompt_done it sees, so sending now would complete the task with the user's answer.
 * ponytail: a turn that starts between this resolving and the send still wins the race. pi rejects
 * our second prompt ("Agent is already processing"), so the task fails and its card stays behind;
 * it only settles on the user's prompt_done when an extension command or input handler took that input.
 */
export function waitUntilIdle(session: Pick<ThreadSessionLike, "isRunning" | "onEvent">): Promise<void> {
  if (!session.isRunning()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = session.onEvent(() => {
      if (!session.isRunning()) { off(); resolve(); }
    });
  });
}

/** D14: a request from another agent is labelled as such and told where to leave files; a reminder comes back labelled and fenced; the user's own tasks and triggers are sent as written. */
export function promptOfTask(task: AgentTask): string {
  if (task.kind === "reminder") return reminderPrompt(task);
  const from = task.requestedBy;
  if (!from || from === "user") return task.prompt;
  return `[Request from agent ${from}, not from the user. Put files meant for ${from} under ${task.cwd}/outbox/${task.id}/ and cite absolute paths in your answer.]\n\n${task.prompt}`;
}

/** D2/D12: the event becomes a card then a prompt in the agent's own thread. Abort ends the turn; the thread stays open. */
export async function startThreadEventRun(task: AgentTask, deps: ThreadRunDeps = defaultDeps()): Promise<RunHandle> {
  if (!task.agent) throw new Error("thread task without an agent");
  const agent = deps.readAgent(task.agent);
  if (!agent) throw new Error(`long-term agent not found: ${task.agent}`);
  const { session, sessionId } = await deps.open(agent);
  await session.waitUntilReady();
  await waitUntilIdle(session);
  const current = deps.readTask(task.id);
  if (!current || TERMINAL.has(current.status)) throw new Error(`task ${current?.status ?? "removed"} while waiting for the thread`);
  if (isPausedFor(readAgentOpsSettings(), task.agent)) throw new Error("agent paused");
  const overBudget = (deps.budgetRefusal ?? triggerBudgetRefusal)(task);
  if (overBudget) throw new Error(overBudget);
  if (task.kind === "reminder") (deps.audit ?? appendAuditSafe)(task.agent, reminderAuditLine(task, "fire"));
  session.appendDisplayEntry(AGENT_EVENT_ENTRY_TYPE, eventOfTask(task));
  const run = watchPromptRun(session, promptOfTask(task));
  return { sessionId, done: run.done, abort: run.abort, usage: run.usage };
}
