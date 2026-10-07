import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-budget-"));
const { spentToday, budgetRefusal, startOfLocalDay } = await (await import("jiti")).createJiti(import.meta.url).import("./budget.ts");

const record = (ts, usage) => ({ ts: ts.toISOString(), origin: "trigger", status: "completed", billing: "api", costEquivalent: 99, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ...usage } });
const now = new Date(2026, 9, 7, 15, 0, 0);

test("spentToday sums today's records from the local midnight, never the equivalent cost", () => {
  const midnight = new Date(2026, 9, 7, 0, 0, 0);
  const spent = spentToday([
    record(new Date(midnight.getTime() - 1), { input: 1000, cost: 5 }), // yesterday, 23:59:59.999
    record(midnight, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: 0.5 }),
    record(new Date(2026, 9, 7, 12), { output: 10, cost: 0.25 }),
  ], now);
  assert.deepEqual(spent, { tokens: 20, cost: 0.75 });
  assert.equal(startOfLocalDay(now).getTime(), midnight.getTime());
});

test("budgetRefusal: null without a budget, refuses at >= (tokens first, then cost), 0 blocks", () => {
  const spent = { tokens: 10, cost: 1 };
  assert.equal(budgetRefusal({}, spent), null);
  assert.equal(budgetRefusal({ budgetTokensPerDay: 11 }, spent), null);
  assert.equal(budgetRefusal({ budgetTokensPerDay: 10 }, spent), "daily token budget reached");
  assert.equal(budgetRefusal({ budgetUsdPerDay: 1.01 }, spent), null);
  assert.equal(budgetRefusal({ budgetUsdPerDay: 1 }, spent), "daily cost budget reached");
  assert.equal(budgetRefusal({ budgetTokensPerDay: 10, budgetUsdPerDay: 1 }, spent), "daily token budget reached");
  assert.equal(budgetRefusal({ budgetTokensPerDay: 100, budgetUsdPerDay: 1 }, spent), "daily cost budget reached");
  assert.equal(budgetRefusal({ budgetTokensPerDay: 0 }, { tokens: 0, cost: 0 }), "daily token budget reached");
});
