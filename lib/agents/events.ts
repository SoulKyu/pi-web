import type { AgentMessage, CustomMessage } from "../types";

export const AGENT_EVENT_ENTRY_TYPE = "pi-web:agent-event";
export const AGENT_EVENT_UI_TYPE = "agent-event";
/** Client-safe name of the trusted-thread push tool (lib/agents/agent-notify.ts registers it). */
export const AGENT_NOTIFY_TOOL = "agent_notify";
export const EVENT_TEXT_MAX = 2000;
const TITLE_MAX = 80;

export type AgentEventData =
  | { version: 1; kind: "schedule" | "task"; taskId: string; triggerId?: string; title: string }
  | { version: 1; kind: "webhook"; taskId: string; triggerId: string; title: string; status: "completed" | "failed"; summary: string; runSessionId?: string };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const clipTitle = (text: string) => (text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function isAgentEventData(value: unknown): value is AgentEventData {
  if (!isRecord(value) || value.version !== 1 || typeof value.taskId !== "string" || typeof value.title !== "string") return false;
  if (value.kind === "schedule" || value.kind === "task") return value.triggerId === undefined || typeof value.triggerId === "string";
  if (value.kind !== "webhook") return false;
  return typeof value.triggerId === "string" && (value.status === "completed" || value.status === "failed") && typeof value.summary === "string"
    && (value.runSessionId === undefined || typeof value.runSessionId === "string");
}

export const buildScheduleEvent = (input: { taskId: string; triggerId: string; title: string }): AgentEventData =>
  ({ version: 1, kind: "schedule", taskId: input.taskId, triggerId: input.triggerId, title: clipTitle(input.title) });
export const buildTaskEvent = (input: { taskId: string; title: string }): AgentEventData =>
  ({ version: 1, kind: "task", taskId: input.taskId, title: clipTitle(input.title) });
/** Display-only (D11): the summary never enters the model context, so clipping loses nothing the agent needs. */
export const buildWebhookEvent = (input: { taskId: string; triggerId: string; title: string; status: "completed" | "failed"; summary: string; runSessionId?: string }): AgentEventData => ({
  version: 1, kind: "webhook", taskId: input.taskId, triggerId: input.triggerId, title: clipTitle(input.title), status: input.status,
  summary: clip(input.summary, EVENT_TEXT_MAX), ...(input.runSessionId ? { runSessionId: input.runSessionId } : {}),
});

/** The summary card of a finished webhook run; null for cancelled or legacy tasks. Display-only: only result or error goes in. */
export function webhookEventOfTask(task: { id: string; triggerId?: string; title: string; status: string; result?: string; error?: string; sessionId?: string }): AgentEventData | null {
  if (!task.triggerId || (task.status !== "completed" && task.status !== "failed")) return null;
  return buildWebhookEvent({
    taskId: task.id, triggerId: task.triggerId, title: task.title, status: task.status,
    summary: (task.status === "completed" ? task.result : task.error) ?? "", ...(task.sessionId ? { runSessionId: task.sessionId } : {}),
  });
}

export function agentEventToUiMessage(data: AgentEventData, timestamp?: number): CustomMessage {
  return { role: "custom", customType: AGENT_EVENT_UI_TYPE, content: data.kind === "webhook" ? data.summary : data.title, display: true, details: data, ...(timestamp !== undefined ? { timestamp } : {}) };
}

const eventOf = (message: AgentMessage): AgentEventData | null =>
  message.role === "custom" && message.customType === AGENT_EVENT_UI_TYPE && isAgentEventData(message.details) ? message.details : null;

/** The prompt an event sent is the user message right after its card: render it folded, not as the user's own words. */
export function eventPromptIndexes(messages: readonly AgentMessage[]): Set<number> {
  const indexes = new Set<number>();
  messages.forEach((message, index) => {
    const previous = index > 0 ? eventOf(messages[index - 1]) : null;
    if (message.role === "user" && previous && previous.kind !== "webhook") indexes.add(index);
  });
  return indexes;
}

export const isSameEvent = (message: AgentMessage, data: AgentEventData): boolean => {
  const existing = eventOf(message);
  return existing !== null && existing.kind === data.kind && existing.taskId === data.taskId;
};

/** entryIds parallels messages; live messages without an id leave holes (read as undefined, as ChatWindow already expects). Pad up to the message count so the new id lands on the appended card. */
export function appendEntryId(prev: readonly string[], messageCount: number, entryId: string): string[] {
  const next = prev.slice();
  next.length = Math.max(next.length, messageCount);
  next.push(entryId);
  return next;
}
