/** Client-safe run usage formatting shared by the usage buckets, task rows and event cards. */
export const formatCompact = (value: number): string => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value);

/** `3 turns · 12k tok · $0.04`, or `≈ $0.04 API-equivalent` when the run billed nothing; the equivalent never joins `cost`. */
export function formatRunUsage(usage: { tokens: number; cost: number; costEquivalent?: number; turns?: number }, labels: { turns: (turns: number) => string; equivalent: string }): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(labels.turns(usage.turns));
  parts.push(`${formatCompact(usage.tokens)} tok`);
  if (usage.cost > 0) parts.push(`$${usage.cost.toFixed(2)}`);
  else if (usage.costEquivalent !== undefined && usage.costEquivalent > 0) parts.push(`≈ $${usage.costEquivalent.toFixed(2)} ${labels.equivalent}`);
  return parts.join(" · ");
}

export interface BudgetBar { kind: "tokens" | "cost"; value: number; max: number; figures: string }

/** One bar per daily budget above 0 (a 0 budget is only the "budget reached" line); `value` stops at the cap, `figures` show the real spend. Cost is provider cost, as the budget counts it. */
export function budgetBars(today: { tokens: number; cost: number }, caps: { tokens?: number; usd?: number }): BudgetBar[] {
  const bars: BudgetBar[] = [];
  if (caps.tokens !== undefined && caps.tokens > 0) {
    bars.push({ kind: "tokens", value: Math.min(today.tokens, caps.tokens), max: caps.tokens, figures: `${formatCompact(today.tokens)} / ${formatCompact(caps.tokens)} tok` });
  }
  if (caps.usd !== undefined && caps.usd > 0) {
    bars.push({ kind: "cost", value: Math.min(today.cost, caps.usd), max: caps.usd, figures: `$${today.cost.toFixed(2)} / $${caps.usd.toFixed(2)}` });
  }
  return bars;
}
