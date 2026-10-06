import assert from "node:assert/strict";
import test from "node:test";
const { firstUnreadIndex } = await (await import("jiti")).createJiti(import.meta.url).import("./agent-view.ts");
test("firstUnreadIndex", () => {
  assert.equal(firstUnreadIndex(["a", "b", "c"], "a"), 1);
  assert.equal(firstUnreadIndex(["a", "b", "c"], "c"), -1);
  assert.equal(firstUnreadIndex(["a", "b", "c"], "zz"), -1);
  assert.equal(firstUnreadIndex(["a", "b", "c"], null), -1);
  assert.equal(firstUnreadIndex([], "a"), -1);
});
