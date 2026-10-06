import assert from "node:assert/strict";
import { test } from "node:test";
const { formatTaskDuration, isActiveTask } = await (await import("jiti")).createJiti(import.meta.url).import("./task-view.ts");

test("formatTaskDuration counts from start to completion, or to now while running", () => {
  const base = { createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:10.000Z" };
  assert.equal(formatTaskDuration({ ...base, completedAt: "2026-01-01T00:00:52.000Z" }), "42s");
  assert.equal(formatTaskDuration({ ...base, completedAt: "2026-01-01T00:03:15.000Z" }), "3m 05s");
  assert.equal(formatTaskDuration({ ...base, completedAt: "2026-01-01T01:12:10.000Z" }), "1h 12m");
  assert.equal(formatTaskDuration(base, Date.parse("2026-01-01T00:00:40.000Z")), "30s");
});

test("formatTaskDuration of a queued task counts from creation and never goes negative", () => {
  assert.equal(formatTaskDuration({ createdAt: "2026-01-01T00:00:00.000Z" }, Date.parse("2026-01-01T00:01:00.000Z")), "1m 00s");
  assert.equal(formatTaskDuration({ createdAt: "2026-01-01T00:00:10.000Z" }, Date.parse("2026-01-01T00:00:00.000Z")), "0s");
});

test("isActiveTask is true for queued and running only", () => {
  assert.deepEqual(["queued", "running", "completed", "failed", "cancelled"].map((status) => isActiveTask({ status })), [true, true, false, false, false]);
});
