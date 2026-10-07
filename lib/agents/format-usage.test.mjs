import assert from "node:assert/strict";
import { test } from "node:test";
const { formatCompact, formatRunUsage } = await (await import("jiti")).createJiti(import.meta.url).import("./format-usage.ts");
const labels = { turns: (n) => `${n} turns`, equivalent: "API-equivalent" };

test("formatCompact", () => {
  assert.deepEqual([999, 12_000, 1_500_000].map(formatCompact), ["999", "12k", "1.5M"]);
});

test("formatRunUsage shows cost when billed, the labelled equivalent otherwise, never both", () => {
  assert.equal(formatRunUsage({ tokens: 12_000, cost: 0.04, costEquivalent: 9, turns: 3 }, labels), "3 turns · 12k tok · $0.04");
  assert.equal(formatRunUsage({ tokens: 12_000, cost: 0, costEquivalent: 0.04, turns: 3 }, labels), "3 turns · 12k tok · ≈ $0.04 API-equivalent");
  assert.equal(formatRunUsage({ tokens: 50, cost: 0 }, labels), "50 tok");
});
