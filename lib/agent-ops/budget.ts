import type { LongTermAgent } from "../agents/registry";
import type { RunRecord } from "./run-registry";

export interface Spent { tokens: number; cost: number }

export const startOfLocalDay = (now: Date): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Tokens and provider cost of the records since the local midnight of `now`. The API-equivalent cost never counts. */
export function spentToday(records: RunRecord[], now = new Date()): Spent {
  const dayStart = startOfLocalDay(now).getTime();
  const spent: Spent = { tokens: 0, cost: 0 };
  for (const record of records) {
    if (!(Date.parse(record.ts) >= dayStart)) continue;
    const { input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0 } = record.usage;
    spent.tokens += input + output + cacheRead + cacheWrite;
    spent.cost += cost;
  }
  return spent;
}

/** Either key reached refuses; a budget of 0 refuses at once (the user's explicit choice). */
export function budgetRefusal(agent: Pick<LongTermAgent, "budgetTokensPerDay" | "budgetUsdPerDay">, spent: Spent): string | null {
  if (agent.budgetTokensPerDay !== undefined && spent.tokens >= agent.budgetTokensPerDay) return "daily token budget reached";
  if (agent.budgetUsdPerDay !== undefined && spent.cost >= agent.budgetUsdPerDay) return "daily cost budget reached";
  return null;
}
