import assert from "node:assert/strict";
import test from "node:test";
const { summarizeAgentUsage } = await (await import("jiti")).createJiti(import.meta.url).import("./usage-summary.ts");
const rec = (ts, over) => ({ ts, agent: "a", origin: "trigger", status: "completed", billing: "subscription", usage: { input: 100, output: 50, cacheRead: 400, cacheWrite: 0, cost: 0, turns: 1, toolCalls: 2, model: "claude-opus-5-5", provider: "claude-bridge" }, costEquivalent: 0.01, ...over });
test("buckets by local day, 7 and 30 days; by model and origin; cache hit rate", () => {
  const now = new Date("2026-10-07T12:00:00");
  const s = summarizeAgentUsage([rec("2026-10-07T08:00:00.000Z"), rec("2026-10-03T08:00:00.000Z", { origin: "user" }), rec("2026-09-01T08:00:00.000Z")], now);
  assert.equal(s.today.runs, 1); assert.equal(s.days7.runs, 2); assert.equal(s.days30.runs, 2);
  assert.equal(s.days7.tokens, 1100); assert.equal(s.days7.costEquivalent, 0.02);
  assert.deepEqual(Object.keys(s.byOrigin).sort(), ["trigger", "user"]);
  assert.equal(s.byModel["claude-opus-5-5"].runs, 2);
  assert.equal(s.cacheHitRate30d, 0.8); // cacheRead / (cacheRead + input)
  assert.equal(s.billing, "subscription");
});
test("empty input: zero buckets, null hit rate, unknown billing", () => {
  const s = summarizeAgentUsage([], new Date("2026-10-07T12:00:00"));
  assert.equal(s.days30.runs, 0); assert.equal(s.cacheHitRate30d, null); assert.equal(s.billing, "unknown");
});
