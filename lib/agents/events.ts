import type { RunUsage } from "../agent-ops/run-usage";
import type { AgentMessage, CustomMessage } from "../types";

export const AGENT_EVENT_ENTRY_TYPE = "pi-web:agent-event";
export const AGENT_EVENT_UI_TYPE = "agent-event";
/** Client-safe name of the trusted-thread push tool (lib/agents/agent-notify.ts registers it). */
export const AGENT_NOTIFY_TOOL = "agent_notify";
/** Client-safe name of the trusted-thread approval tool (lib/agents/agent-approve.ts registers it). */
export const AGENT_APPROVE_TOOL = "agent_approve";
/** Client-safe name of the trusted-thread delegation tool (lib/agents/agent-delegate.ts registers it). */
export const AGENT_DELEGATE_TOOL = "agent_delegate";
export const EVENT_TEXT_MAX = 2000;
/** A delegation result is display-only and often long (a review): keep more of it than other cards. */
export const DELEGATION_TEXT_MAX = 16_000;
const TITLE_MAX = 80;

export type EventFireReason = { source: "schedule" | "webhook" | "manual"; bucket?: number; payloadHash?: string };

/** Display-only run usage on a summary card. `costEquivalent` is the API-equivalent of a subscription run: never added to `cost`. */
export type EventUsage = { tokens: number; cost: number; costEquivalent?: number; turns?: number };

export type AgentEventData =
  /** `handedFrom`: the requester thread of a user hand-over (shown as provenance in the target's thread). */
  | { version: 1; kind: "schedule" | "task"; taskId: string; triggerId?: string; title: string; fireReason?: EventFireReason; requestedBy?: string; handedFrom?: string }
  /** D14: another agent's result, display-only. `tainted`: the run read web content or a webhook payload. `clipped`: the summary was cut at DELEGATION_TEXT_MAX. Older cards have neither `purpose` nor `clipped`. */
  | { version: 1; kind: "delegation"; taskId: string; title: string; from: string; status: "completed" | "failed"; summary: string; runSessionId?: string; tainted: boolean; purpose?: "review" | "handoff"; clipped?: true }
  | { version: 1; kind: "webhook"; taskId: string; triggerId: string; title: string; status: "completed" | "failed"; summary: string; runSessionId?: string; taskKind?: "schedule" | "webhook"; usage?: EventUsage };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const clipTitle = (text: string) => (text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function isAgentEventData(value: unknown): value is AgentEventData {
  if (!isRecord(value) || value.version !== 1 || typeof value.taskId !== "string" || typeof value.title !== "string") return false;
  if (value.kind === "delegation") {
    return typeof value.from === "string" && (value.status === "completed" || value.status === "failed") && typeof value.summary === "string" && typeof value.tainted === "boolean"
      && (value.runSessionId === undefined || typeof value.runSessionId === "string")
      && (value.purpose === undefined || value.purpose === "review" || value.purpose === "handoff")
      && (value.clipped === undefined || value.clipped === true);
  }
  if (value.kind === "schedule" || value.kind === "task") {
    const reason = value.fireReason;
    const reasonOk = reason === undefined || (isRecord(reason) && (reason.source === "schedule" || reason.source === "webhook" || reason.source === "manual"));
    return reasonOk && (value.triggerId === undefined || typeof value.triggerId === "string")
      && (value.requestedBy === undefined || typeof value.requestedBy === "string")
      && (value.handedFrom === undefined || typeof value.handedFrom === "string");
  }
  if (value.kind !== "webhook") return false;
  if (value.taskKind !== undefined && value.taskKind !== "schedule" && value.taskKind !== "webhook") return false;
  if (value.usage !== undefined) {
    const usage = value.usage;
    const numeric = (field: string, optional: boolean) => isRecord(usage) && (usage[field] === undefined ? optional : typeof usage[field] === "number" && Number.isFinite(usage[field]));
    if (!numeric("tokens", false) || !numeric("cost", false) || !numeric("costEquivalent", true) || !numeric("turns", true)) return false;
  }
  return typeof value.triggerId === "string" && (value.status === "completed" || value.status === "failed") && typeof value.summary === "string"
    && (value.runSessionId === undefined || typeof value.runSessionId === "string");
}

export const buildScheduleEvent = (input: { taskId: string; triggerId: string; title: string; fireReason?: EventFireReason }): AgentEventData =>
  ({ version: 1, kind: "schedule", taskId: input.taskId, triggerId: input.triggerId, title: clipTitle(input.title), ...(input.fireReason ? { fireReason: input.fireReason } : {}) });
export const buildTaskEvent = (input: { taskId: string; title: string; requestedBy?: string; handedFrom?: string }): AgentEventData =>
  ({ version: 1, kind: "task", taskId: input.taskId, title: clipTitle(input.title), ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}), ...(input.handedFrom ? { handedFrom: input.handedFrom } : {}) });
/** Display-only (D11): the summary never enters the model context, so clipping loses nothing the agent needs. */
export const buildWebhookEvent = (input: { taskId: string; triggerId: string; title: string; status: "completed" | "failed"; summary: string; runSessionId?: string; taskKind?: "schedule" | "webhook"; usage?: EventUsage }): AgentEventData => ({
  version: 1, kind: "webhook", taskId: input.taskId, triggerId: input.triggerId, title: clipTitle(input.title), status: input.status,
  summary: clip(input.summary, EVENT_TEXT_MAX), ...(input.runSessionId ? { runSessionId: input.runSessionId } : {}),
  ...(input.taskKind ? { taskKind: input.taskKind } : {}),
  ...(input.usage ? { usage: input.usage } : {}),
});

/** The result card of a task delivered to another agent's thread; null unless it ended completed or failed under an agent. Display-only (D14): unknown usage counts as tainted. */
export function delegationEventOfTask(task: { id: string; title: string; agent?: string; status: string; result?: string; error?: string; sessionId?: string; kind?: string; usage?: Pick<RunUsage, "externalTools"> }): AgentEventData | null {
  if (!task.agent || (task.status !== "completed" && task.status !== "failed")) return null;
  const text = (task.status === "completed" ? task.result : task.error) ?? "";
  return {
    version: 1, kind: "delegation", taskId: task.id, title: clipTitle(task.title), from: task.agent, status: task.status,
    summary: clip(text, DELEGATION_TEXT_MAX), ...(text.length > DELEGATION_TEXT_MAX ? { clipped: true as const } : {}), ...(task.sessionId ? { runSessionId: task.sessionId } : {}),
    tainted: task.kind === "webhook" || (task.usage?.externalTools ?? true),
    purpose: task.kind === "review" ? "review" : "handoff",
  };
}

const usageOfTask = (usage: RunUsage, costEquivalent?: number): EventUsage =>
  ({ tokens: usage.input + usage.output + usage.cacheRead + usage.cacheWrite, cost: usage.cost, turns: usage.turns, ...(costEquivalent !== undefined ? { costEquivalent } : {}) });

/** The summary card of a finished isolated run (webhook or isolated schedule); null for cancelled or legacy tasks. Display-only: only result or error goes in. */
export function webhookEventOfTask(task: { id: string; triggerId?: string; title: string; status: string; result?: string; error?: string; sessionId?: string; kind?: string; usage?: RunUsage; costEquivalent?: number }): AgentEventData | null {
  if (!task.triggerId || (task.status !== "completed" && task.status !== "failed")) return null;
  return buildWebhookEvent({
    taskId: task.id, triggerId: task.triggerId, title: task.title, status: task.status,
    summary: (task.status === "completed" ? task.result : task.error) ?? "", ...(task.sessionId ? { runSessionId: task.sessionId } : {}),
    ...(task.kind === "schedule" ? { taskKind: "schedule" as const } : {}),
    ...(task.usage ? { usage: usageOfTask(task.usage, task.costEquivalent) } : {}),
  });
}

export function agentEventToUiMessage(data: AgentEventData, timestamp?: number): CustomMessage {
  return { role: "custom", customType: AGENT_EVENT_UI_TYPE, content: data.kind === "webhook" || data.kind === "delegation" ? data.summary : data.title, display: true, details: data, ...(timestamp !== undefined ? { timestamp } : {}) };
}

const eventOf = (message: AgentMessage): AgentEventData | null =>
  message.role === "custom" && message.customType === AGENT_EVENT_UI_TYPE && isAgentEventData(message.details) ? message.details : null;

/** The prompt an event sent is the user message right after its card: render it folded, not as the user's own words. */
export function eventPromptIndexes(messages: readonly AgentMessage[]): Set<number> {
  const indexes = new Set<number>();
  messages.forEach((message, index) => {
    const previous = index > 0 ? eventOf(messages[index - 1]) : null;
    if (message.role === "user" && previous && previous.kind !== "webhook" && previous.kind !== "delegation") indexes.add(index);
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
