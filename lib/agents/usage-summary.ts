import type { Billing } from "../cost-equivalent";
import type { RunRecord } from "../agent-ops/run-registry";

export interface UsageBucket { runs: number; tokens: number; cost: number; costEquivalent: number; cacheRead: number; input: number }
export interface AgentUsageSummary {
  today: UsageBucket; days7: UsageBucket; days30: UsageBucket;
  byModel: Record<string, UsageBucket>; byOrigin: Record<string, UsageBucket>;
  cacheHitRate30d: number | null; billing: Billing;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const emptyBucket = (): UsageBucket => ({ runs: 0, tokens: 0, cost: 0, costEquivalent: 0, cacheRead: 0, input: 0 });

function add(bucket: UsageBucket, record: RunRecord): void {
  const { input, output, cacheRead, cacheWrite, cost } = record.usage;
  bucket.runs += 1;
  bucket.tokens += input + output + cacheRead + cacheWrite;
  bucket.cost += cost;
  bucket.costEquivalent += record.costEquivalent ?? 0;
  bucket.cacheRead += cacheRead;
  bucket.input += input;
}

/** Today starts at local midnight; 7 and 30 days are rolling windows. `cost` and `costEquivalent` stay separate. */
export function summarizeAgentUsage(records: RunRecord[], now = new Date()): AgentUsageSummary {
  const nowMs = now.getTime();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const summary: AgentUsageSummary = { today: emptyBucket(), days7: emptyBucket(), days30: emptyBucket(), byModel: {}, byOrigin: {}, cacheHitRate30d: null, billing: "unknown" };
  let newest = -Infinity;
  for (const record of records) {
    const ts = Date.parse(record.ts);
    if (Number.isNaN(ts) || ts < nowMs - 30 * DAY_MS) continue;
    add(summary.days30, record);
    if (ts >= nowMs - 7 * DAY_MS) add(summary.days7, record);
    if (ts >= dayStart) add(summary.today, record);
    add(summary.byModel[record.usage.model ?? "unknown"] ??= emptyBucket(), record);
    add(summary.byOrigin[record.origin] ??= emptyBucket(), record);
    if (ts > newest) { newest = ts; summary.billing = record.billing; }
  }
  const { cacheRead, input } = summary.days30;
  if (cacheRead + input > 0) summary.cacheHitRate30d = cacheRead / (cacheRead + input);
  return summary;
}
