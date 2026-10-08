import assert from "node:assert/strict";
import { test } from "node:test";
const { budgetBars, formatCompact, formatRunUsage } = await (await import("jiti")).createJiti(import.meta.url).import("./format-usage.ts");
const labels = { turns: (n) => `${n} turns`, equivalent: "API-equivalent" };

test("formatCompact", () => {
  assert.deepEqual([999, 12_000, 1_500_000].map(formatCompact), ["999", "12k", "1.5M"]);
});

test("formatRunUsage shows cost when billed, the labelled equivalent otherwise, never both", () => {
  assert.equal(formatRunUsage({ tokens: 12_000, cost: 0.04, costEquivalent: 9, turns: 3 }, labels), "3 turns · 12k tok · $0.04");
  assert.equal(formatRunUsage({ tokens: 12_000, cost: 0, costEquivalent: 0.04, turns: 3 }, labels), "3 turns · 12k tok · ≈ $0.04 API-equivalent");
  assert.equal(formatRunUsage({ tokens: 50, cost: 0 }, labels), "50 tok");
});

test("budgetBars: one bar per budget above 0, value clamped to the cap, figures unclamped", () => {
  assert.deepEqual(budgetBars({ tokens: 12_000, cost: 0.4 }, { tokens: 50_000, usd: 1 }), [
    { kind: "tokens", value: 12_000, max: 50_000, figures: "12k / 50k tok" },
    { kind: "cost", value: 0.4, max: 1, figures: "$0.40 / $1.00" },
  ]);
  assert.deepEqual(
    budgetBars({ tokens: 80_000, cost: 2.5 }, { tokens: 50_000, usd: 1 }).map((bar) => [bar.value, bar.figures]),
    [[50_000, "80k / 50k tok"], [1, "$2.50 / $1.00"]],
  );
  assert.deepEqual(budgetBars({ tokens: 5, cost: 1 }, { tokens: 0, usd: 0 }), []);
  assert.deepEqual(budgetBars({ tokens: 5, cost: 1 }, {}), []);
  assert.deepEqual(budgetBars({ tokens: 5, cost: 0 }, { usd: 2 }).map((bar) => bar.kind), ["cost"]);
});
