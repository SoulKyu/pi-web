import { AGENT_EVENT_ENTRY_TYPE, isAgentEventData } from "./events";
import type { SessionEntry } from "../types";
import type { AgentTask } from "../agent-ops/task-store";

export interface InboxItem { kind: "card" | "reply" | "task" | "approval"; entryId?: string; title: string; at: string; detail?: string }

const TITLE_MAX = 80;
const ITEMS_MAX = 50;
const DAY_MS = 24 * 3_600_000;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

const time = (iso: string) => Date.parse(iso) || 0;

function replyText(entry: SessionEntry): string {
  const content = (entry as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((part) => (part as { type?: string; text?: string })?.type === "text" ? part.text ?? "" : "").join(" ") : "";
}

/** What happened since the agent's last visit: cards and replies after `lastReadEntryId` (unknown marker: everything, as countUnread), terminal tasks after that entry's time (no usable marker: the last 24 h). Display-only, newest first. */
export function inboxItems(agent: { name: string; lastReadEntryId?: string }, entries: readonly SessionEntry[], tasks: readonly Pick<AgentTask, "agent" | "status" | "completedAt" | "title">[], now: number): InboxItem[] {
  const at = agent.lastReadEntryId ? entries.findIndex((entry) => entry.id === agent.lastReadEntryId) : -1;
  const items: InboxItem[] = [];
  for (let index = at + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    const stamp = entry.timestamp ?? "";
    if (entry.type === "custom" && entry.customType === AGENT_EVENT_ENTRY_TYPE) {
      const data = (entry as { data?: unknown }).data;
      if (!isAgentEventData(data)) continue;
      items.push({ kind: "card", entryId: entry.id, title: data.title, at: stamp, ...(data.kind === "webhook" || data.kind === "delegation" ? { detail: data.status } : {}) });
    } else if (entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant") {
      const text = replyText(entry).replace(/\s+/g, " ").trim();
      if (text) items.push({ kind: "reply", entryId: entry.id, title: text.slice(0, TITLE_MAX), at: stamp });
    }
  }
  const markerAt = at >= 0 ? time(entries[at].timestamp ?? "") : 0;
  const since = markerAt > 0 ? markerAt : now - DAY_MS;
  for (const task of tasks) {
    if (task.agent !== agent.name || !TERMINAL.has(task.status) || !task.completedAt || time(task.completedAt) <= since) continue;
    items.push({ kind: "task", title: task.title, at: task.completedAt, detail: task.status });
  }
  return items.sort((a, b) => time(b.at) - time(a.at)).slice(0, ITEMS_MAX);
}
