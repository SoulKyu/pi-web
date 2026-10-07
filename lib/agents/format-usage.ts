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
