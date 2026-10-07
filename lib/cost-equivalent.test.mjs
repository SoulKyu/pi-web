import assert from "node:assert/strict";
import test from "node:test";
const { billingOf, equivalentCost, modelPrices } = await (await import("jiti")).createJiti(import.meta.url).import("./cost-equivalent.ts");
test("billing: claude-bridge is a subscription, zai is API", () => {
  assert.equal(billingOf("claude-bridge"), "subscription");
  assert.equal(billingOf("zai"), "api");
  assert.equal(billingOf(undefined), "unknown");
  assert.equal(billingOf(""), "unknown");
});
test("equivalentCost prices per million tokens", () => {
  assert.equal(equivalentCost({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 }), 15);
  assert.equal(equivalentCost({ input: 0, output: 2_000_000, cacheRead: 1_000_000, cacheWrite: 0 }, { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 }), 151.5);
});
test("modelPrices: models.json wins, then the catalog under the upstream provider", () => {
  const config = { providers: { "claude-bridge": { models: [{ id: "claude-opus-5-5", cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 } }] } } };
  assert.deepEqual(modelPrices("claude-bridge", "claude-opus-5-5", { readModelsConfig: () => config, catalog: () => [] }), { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 });
  const catalog = [{ provider: "anthropic", id: "claude-sonnet-5-5", cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } }];
  assert.deepEqual(modelPrices("claude-bridge", "claude-sonnet-5-5", { readModelsConfig: () => ({}), catalog: () => catalog }), { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
  assert.deepEqual(modelPrices("claude-bridge", "claude-bridge/claude-sonnet-5-5", { readModelsConfig: () => ({}), catalog: () => catalog }), { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
  assert.equal(modelPrices("zai", "glm-9", { readModelsConfig: () => ({}), catalog: () => [] }), undefined);
});
