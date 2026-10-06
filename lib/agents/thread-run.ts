import { watchPromptRun, type PromptRunSession } from "../agent-ops/prompt-run";
import type { RunHandle } from "../agent-ops/runner";
import type { AgentTask } from "../agent-ops/task-store";
import { AGENT_EVENT_ENTRY_TYPE, buildScheduleEvent, buildTaskEvent, type AgentEventData } from "./events";
import { getLongTermAgent, type LongTermAgent } from "./registry";
import { openThread } from "./thread";

export interface ThreadSessionLike extends PromptRunSession { isRunning(): boolean; appendDisplayEntry(customType: string, data: unknown): string }
export interface ThreadRunDeps { open: (agent: LongTermAgent) => Promise<{ session: ThreadSessionLike; sessionId: string }>; readAgent: typeof getLongTermAgent }
const defaultDeps = (): ThreadRunDeps => ({ open: openThread, readAgent: getLongTermAgent });

export function eventOfTask(task: AgentTask): AgentEventData {
  return task.kind === "schedule" && task.triggerId
    ? buildScheduleEvent({ taskId: task.id, triggerId: task.triggerId, title: task.title })
    : buildTaskEvent({ taskId: task.id, title: task.title });
}

/**
 * The selector saw an idle thread, but a user turn may have started since. watchPromptRun settles
 * on the first prompt_done it sees, so sending now would complete the task with the user's answer.
 * ponytail: a turn that starts between this resolving and the send still wins the race; pi then
 * queues our prompt behind it (promptAdmission) and the first prompt_done ends our watch early.
 */
export function waitUntilIdle(session: Pick<ThreadSessionLike, "isRunning" | "onEvent">): Promise<void> {
  if (!session.isRunning()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = session.onEvent((event) => {
      if ((event.type === "agent_settled" || event.type === "prompt_done") && !session.isRunning()) { off(); resolve(); }
    });
  });
}

/** D2/D12: the event becomes a card then a prompt in the agent's own thread. Abort ends the turn; the thread stays open. */
export async function startThreadEventRun(task: AgentTask, deps: ThreadRunDeps = defaultDeps()): Promise<RunHandle> {
  if (!task.agent) throw new Error("thread task without an agent");
  const agent = deps.readAgent(task.agent);
  if (!agent) throw new Error(`long-term agent not found: ${task.agent}`);
  const { session, sessionId } = await deps.open(agent);
  await session.waitUntilReady();
  await waitUntilIdle(session);
  session.appendDisplayEntry(AGENT_EVENT_ENTRY_TYPE, eventOfTask(task));
  const { done, abort } = watchPromptRun(session, task.prompt);
  return { sessionId, done, abort };
}
