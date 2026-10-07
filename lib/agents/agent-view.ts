import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentAvatar, LongTermAgent, ToolsPreset } from "./registry";
import { pickRoadmapSettings, type AgentRoadmapSettings } from "./roadmap-settings";

export interface AgentListItem { name: string; avatar: AgentAvatar; model?: string; thinking?: ThinkingLevel; toolsPreset: ToolsPreset; mcpServers: string[]; home: string; threadSessionId?: string; createdAt: string; running: boolean; unread: number; paused: boolean; state: AgentState; lastPreview?: string; lastActivityAt?: string }
export type AgentState = "idle" | "running" | "needs_input" | "failed"

/** needs_input (a live request waits for the user) > running > failed (newest unread card) > idle. */
export const agentState = (flags: { needsInput: boolean; running: boolean; failedUnread: boolean }): AgentState =>
  flags.needsInput ? "needs_input" : flags.running ? "running" : flags.failedUnread ? "failed" : "idle";
/** Server-computed paths and stats the client only displays or interpolates. */
export interface AgentDetailExtras { memorySnapshotPath?: string; memoryMd?: { size: number } }
export interface AgentDetail extends AgentListItem, AgentRoadmapSettings, AgentDetailExtras { role: string; lastReadEntryId?: string }

/** Client-safe card: explicit allowlist, never the role. */
export function toAgentListItem(agent: LongTermAgent, running: boolean, unread: number, paused = false, rail: { state?: AgentState; lastPreview?: string; lastActivityAt?: string } = {}): AgentListItem {
  return {
    name: agent.name, avatar: agent.avatar, toolsPreset: agent.toolsPreset, mcpServers: agent.mcpServers, home: agent.home, createdAt: agent.createdAt, running, unread, paused, state: rail.state ?? (running ? "running" : "idle"),
    ...(rail.lastPreview ? { lastPreview: rail.lastPreview } : {}), ...(rail.lastActivityAt ? { lastActivityAt: rail.lastActivityAt } : {}),
    ...(agent.model ? { model: agent.model } : {}), ...(agent.thinking ? { thinking: agent.thinking } : {}),
    ...(agent.threadSessionId ? { threadSessionId: agent.threadSessionId } : {}),
  };
}
export const toAgentDetail = (agent: LongTermAgent, running: boolean, unread: number, extras: AgentDetailExtras = {}): AgentDetail =>
  ({ ...toAgentListItem(agent, running, unread), ...extras, role: agent.role, ...(agent.lastReadEntryId ? { lastReadEntryId: agent.lastReadEntryId } : {}),
    ...pickRoadmapSettings(agent) });

export const unreadLabel = (unread: number): string => (unread <= 0 ? "" : unread > 99 ? "99+" : String(unread));
export function modelLabel(model: string | undefined): string {
  if (!model) return "";
  const id = model.slice(model.indexOf("/") + 1);
  return id.replace(/^claude-/, "");
}
export function splitModel(model: string): { provider: string; modelId: string } | null {
  const slash = model.indexOf("/");
  return slash > 0 && slash < model.length - 1 ? { provider: model.slice(0, slash), modelId: model.slice(slash + 1) } : null;
}
/** Profile edits re-snapshot the thread and may send set_model: never under a running turn (Review Focus 5). */
export function canEditProfile(threadRunning: boolean): { ok: true } | { ok: false; status: 409; error: "agent_running" } {
  return threadRunning ? { ok: false, status: 409, error: "agent_running" } : { ok: true };
}
/** Index of the first entry after the read marker; -1 when there is nothing to divide (no, unknown or last marker). */
export function firstUnreadIndex(entryIds: readonly string[], marker: string | null): number {
  if (!marker) return -1;
  const at = entryIds.indexOf(marker);
  return at >= 0 && at < entryIds.length - 1 ? at + 1 : -1;
}
