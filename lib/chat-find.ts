import type { AgentMessage } from "./types";

/** One find hit: the entry, and for an assistant message the index of the matching text block in its content. */
export interface ChatFindHit {
  entryId: string;
  blockIndex?: number;
}

/**
 * Case-insensitive literal substring search over the loaded messages: a user message's text, and
 * each text block of an assistant message (one hit per block). Thinking, tool calls and tool
 * results are not searched. Messages without an entry id (not saved yet) are skipped. Hits come
 * in transcript order. A blank query finds nothing.
 */
export function findInMessages(messages: readonly AgentMessage[], entryIds: readonly (string | undefined)[], query: string): ChatFindHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: ChatFindHit[] = [];
  messages.forEach((message, index) => {
    const entryId = entryIds[index];
    if (!entryId) return;
    if (message.role === "user") {
      const content = message.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content) ? content.map((block) => (block.type === "text" ? block.text : "")).join("\n") : "";
      if (text.toLowerCase().includes(needle)) hits.push({ entryId });
    } else if (message.role === "assistant" && Array.isArray(message.content)) {
      message.content.forEach((block, blockIndex) => {
        if (block.type === "text" && block.text.toLowerCase().includes(needle)) hits.push({ entryId, blockIndex });
      });
    }
  });
  return hits;
}

/** The hit after (`1`) or before (`-1`) `current`, wrapping. Nothing selected yet (or out of range) goes to the first or the last. */
export function stepFindIndex(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0 || current >= count) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
