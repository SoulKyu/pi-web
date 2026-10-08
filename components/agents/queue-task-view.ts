import type { AgentListItem } from "@/lib/agents/agent-view";

/** A3: a hand-over target with the status the rail poll already has. */
export type HandTarget = Pick<AgentListItem, "name" | "paused" | "running">;

/** Mirrors QUOTE_MAX in app/api/agents/[name]/tasks/route.ts, counted the same way (quote.length); the route stays authoritative. */
export const QUOTE_MAX = 20_000;
const REVIEW_EXCERPT_MAX = 60;

/** A4: a quote over the route's cap keeps its head and says how much was cut, so the request still goes through. */
export function clipQuote(quote: string, max = QUOTE_MAX): { text: string; clipped: boolean; kept: number } {
  if (quote.length <= max) return { text: quote, clipped: false, kept: quote.length };
  const suffix = (kept: number) => `…[truncated, ${kept} of ${quote.length} characters]`;
  let kept = max - suffix(max).length; // suffix(max) is at least as long as suffix(kept)
  const last = quote.charCodeAt(kept - 1);
  if (last >= 0xd800 && last <= 0xdbff) kept -= 1; // never end on half an emoji
  return { text: quote.slice(0, kept) + suffix(kept), clipped: true, kept };
}

/** A5: the first non-empty line of the quote without markdown markers, for a "Review: …" task title. */
export function reviewExcerpt(quote: string): string {
  const line = quote.split("\n").map((part) => part.replace(/^[\s#>*-]+/, "").trim()).find(Boolean) ?? "";
  return line.length > REVIEW_EXCERPT_MAX ? `${line.slice(0, REVIEW_EXCERPT_MAX - 1)}…` : line;
}

export type QueueErrorKey = "agents.handTo.errorQuoteTooLong" | "agents.handTo.errorUnknownAgent" | "agents.tasks.promptTooLong";

/** A1: the task route's known refusals, localized; anything else is shown as the route wrote it. */
export function queueErrorKey(error: string): QueueErrorKey | null {
  if (error.startsWith("quote must be a string of at most ")) return "agents.handTo.errorQuoteTooLong";
  if (error === "deliverTo must name an existing agent" || error === "Agent not found") return "agents.handTo.errorUnknownAgent";
  if (error.startsWith("prompt is limited to ")) return "agents.tasks.promptTooLong";
  return null;
}
