import { AGENT_EVENT_UI_TYPE } from "../../../lib/agents/events";
import { RECALL_UI_TYPE } from "../../../lib/agents/recall-card";

export type Author = "agent" | "user" | "system";

/** Two items of the same author further apart than this start a new group (Slack's rule of thumb). */
export const GROUP_GAP_MS = 5 * 60_000;

/** Who "speaks" a top-level thread item; null = not part of the conversation flow (no header, no break). */
export function authorOf(message: { role: string; customType?: string }, options: { eventPrompt?: boolean } = {}): Author | null {
  if (message.role === "user") return options.eventPrompt ? "system" : "user";
  if (message.role === "bashExecution") return "user";
  if (message.role === "assistant") return "agent";
  if (message.role === "toolResult") return null;
  if (message.role === "custom" && message.customType === RECALL_UI_TYPE) return null;
  if (message.role === "custom" && message.customType === AGENT_EVENT_UI_TYPE) return "system";
  return "system";
}

/** Fed in render order; open() answers whether this item gets a group header. */
export function createGroupTracker(gapMs = GROUP_GAP_MS) {
  let previous: { author: Author; at?: number } | null = null;
  return {
    open(author: Author, at: number | undefined, breaks = false): boolean {
      const before = previous;
      previous = { author, at };
      if (author === "system") return false;
      if (breaks || !before || before.author !== author) return true;
      if (at === undefined || before.at === undefined) return true;
      return at - before.at >= gapMs;
    },
    last(): Author | null {
      return previous?.author ?? null;
    },
  };
}
