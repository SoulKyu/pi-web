import type { AgentState } from "../../../lib/agents/agent-view";

export type PresenceKey = "needsInput" | "working" | "failed" | "paused" | "quietHours" | "available";
export interface Presence { key: PresenceKey; tone: "orange" | "cyan" | "red" | "dim" }

/** Conversation header status: the rail's state order first, then pause, then quiet hours. */
export function presenceOf(input: { state: AgentState; paused: boolean; globalPaused: boolean; quietHours: boolean }): Presence {
  if (input.state === "needs_input") return { key: "needsInput", tone: "orange" };
  if (input.state === "running") return { key: "working", tone: "cyan" };
  if (input.state === "failed") return { key: "failed", tone: "red" };
  if (input.paused || input.globalPaused) return { key: "paused", tone: "dim" };
  if (input.quietHours) return { key: "quietHours", tone: "dim" };
  return { key: "available", tone: "dim" };
}
