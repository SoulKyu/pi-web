export type ToolCallStatus = "running" | "done" | "failed" | "none";

/** null: no result yet but the run (or the streamed message) may still bring one, so nothing is claimed. */
export function toolCallStatus({ hasResult, isError, running, awaitingResult }: { hasResult: boolean; isError: boolean; running: boolean; awaitingResult: boolean }): ToolCallStatus | null {
  if (running) return "running";
  if (hasResult) return isError ? "failed" : "done";
  return awaitingResult ? null : "none";
}

export const TOOL_STATUS_GLYPH: Record<Exclude<ToolCallStatus, "running">, string> = { done: "✓", failed: "✕", none: "–" };

export const TOOL_STATUS_LABEL_KEY: Record<ToolCallStatus, string> = {
  running: "chat.toolStatus.running",
  done: "chat.toolStatus.done",
  failed: "chat.toolStatus.failed",
  none: "chat.toolStatus.noResult",
};

/** The previous set while the ids are the same members, so a memoized consumer skips progress ticks. */
export function stableIdSet(previous: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  const next = new Set(ids);
  if (next.size === previous.size && [...next].every((id) => previous.has(id))) return previous;
  return next;
}
