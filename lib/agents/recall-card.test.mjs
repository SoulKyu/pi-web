import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { RECALL_ENTRY_TYPE, RECALL_UI_TYPE, isRecallEntryData, recallEntryToUiMessage } = await createJiti(import.meta.url).import("./recall-card.ts");

const data = { version: 1, query: "tea?", ms: 86, hits: [{ id: "m1", scope: "agent", score: 0.71, text: "likes tea" }] };

test("entry and UI type names", () => {
  assert.equal(RECALL_ENTRY_TYPE, "pi-mem0:recall");
  assert.equal(RECALL_UI_TYPE, "memory-recall");
});

test("isRecallEntryData accepts the shape and refuses junk", () => {
  assert.equal(isRecallEntryData(data), true);
  assert.equal(isRecallEntryData({ ...data, hits: [] }), true);
  for (const bad of [null, "x", {}, { ...data, version: 2 }, { ...data, query: 1 }, { ...data, ms: Infinity }, { ...data, hits: "no" },
    { ...data, hits: [{ id: "a", scope: "other", score: 1, text: "t" }] }, { ...data, hits: [{ id: "a", scope: "user", score: "1", text: "t" }] },
    { ...data, hits: [null] }]) assert.equal(isRecallEntryData(bad), false);
});

test("recallEntryToUiMessage builds a displayed custom message", () => {
  assert.deepEqual(recallEntryToUiMessage(data, 5), { role: "custom", customType: "memory-recall", content: "", display: true, details: data, timestamp: 5 });
  assert.equal("timestamp" in recallEntryToUiMessage(data), false);
});
