import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { computeSessionTotalActiveMs, toolDurations, topTools } = await jiti.import("./session-timing.ts");

const base = Date.parse("2026-01-01T00:00:00.000Z");
const timestamp = (ms) => new Date(base + ms).toISOString();
let nextId = 0;

function entry(type, ms, extra = {}) {
  return {
    type,
    id: String(++nextId),
    parentId: null,
    timestamp: timestamp(ms),
    ...extra,
  };
}
function message(role, ms, extra = {}) {
  return entry("message", ms, { ...extra, message: { role, content: [] } });
}

test("empty or single-entry session yields zero", () => {
  assert.equal(computeSessionTotalActiveMs([]), 0);
  assert.equal(computeSessionTotalActiveMs([message("user", 1000)]), 0);
});

test("counts active gaps within a turn", () => {
  const entries = [
    message("user", 1000),
    message("assistant", 4000),
    message("toolResult", 7000),
    message("assistant", 9000),
  ];
  assert.equal(computeSessionTotalActiveMs(entries), 8000);
});

test("drops human idle before the next user message", () => {
  const entries = [
    message("user", 0),
    message("assistant", 3000),
    message("user", 20000),
    message("assistant", 23000),
  ];
  assert.equal(computeSessionTotalActiveMs(entries), 6000);
});

test("keeps compacted history and compaction time in append order", () => {
  const entries = [
    message("user", 0),
    message("assistant", 3000),
    message("user", 20000),
    message("assistant", 25000),
    entry("compaction", 27000),
    message("assistant", 30000),
  ];
  assert.equal(computeSessionTotalActiveMs(entries), 13000);
});

test("counts work appended on every branch exactly once", () => {
  const root = message("user", 0);
  const shared = message("assistant", 2000, { parentId: root.id });
  const branchAUser = message("user", 10000, { parentId: shared.id });
  const branchAResult = message("assistant", 13000, { parentId: branchAUser.id });
  const branchBUser = message("user", 20000, { parentId: shared.id });
  const branchBResult = message("assistant", 24000, { parentId: branchBUser.id });
  const entries = [root, shared, branchAUser, branchAResult, branchBUser, branchBResult];
  assert.equal(computeSessionTotalActiveMs(entries), 9000);
});

test("treats user-initiated bash as a boundary", () => {
  const entries = [
    message("user", 0),
    message("assistant", 2000),
    message("bashExecution", 100000),
    message("user", 110000),
    message("assistant", 113000),
  ];
  assert.equal(computeSessionTotalActiveMs(entries), 5000);
});

test("ignores metadata without breaking the active interval", () => {
  const entries = [
    message("user", 0),
    entry("model_change", 1000),
    message("assistant", 4000),
  ];
  assert.equal(computeSessionTotalActiveMs(entries), 4000);
});

test("counts branch summaries and custom messages", () => {
  const entries = [
    message("user", 0),
    entry("branch_summary", 2000),
    entry("custom_message", 3000),
    message("assistant", 5000),
  ];
  assert.equal(computeSessionTotalActiveMs(entries), 5000);
});

test("skips invalid timestamps and ignores negative gaps", () => {
  const invalid = { ...message("assistant", 2000), timestamp: "invalid" };
  const entries = [message("user", 5000), invalid, message("assistant", 3000)];
  assert.equal(computeSessionTotalActiveMs(entries), 0);
});

function assistant(ms, ids) {
  return entry("message", ms, { message: { role: "assistant", content: ids.map(([id, name]) => ({ type: "toolCall", id, name })) } });
}
function result(ms, id) {
  return entry("message", ms, { message: { role: "toolResult", toolCallId: id, content: [] } });
}

test("toolDurations: result time minus the assistant message, per tool, sorted desc", () => {
  const out = toolDurations([
    message("user", 0),
    assistant(1000, [["a", "bash"]]),
    result(3000, "a"),
    assistant(4000, [["b", "read"], ["c", "bash"]]),
    result(4500, "b"),
    result(10000, "c"),
  ]);
  assert.deepEqual(out, [{ name: "bash", totalMs: 8000, calls: 2 }, { name: "read", totalMs: 500, calls: 1 }]);
});

test("toolDurations ignores unmatched results and bad timestamps", () => {
  const bad = { ...result(0, "z"), timestamp: "nope" };
  assert.deepEqual(toolDurations([assistant(0, [["a", "bash"]]), result(100, "x"), bad, { ...result(0, "a"), timestamp: "nope" }]), []);
  assert.deepEqual(toolDurations([]), []);
});

test("topTools keeps the first n", () => {
  const d = Array.from({ length: 7 }, (_, i) => ({ name: `t${i}`, totalMs: 100 - i, calls: 1 }));
  assert.equal(topTools(d).length, 5);
  assert.equal(topTools(d, 2).length, 2);
});
