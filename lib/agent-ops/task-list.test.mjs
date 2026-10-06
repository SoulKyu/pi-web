import assert from "node:assert/strict";
import { test } from "node:test";
const list = await (await import("jiti")).createJiti(import.meta.url).import("./task-list.ts");

const task = (n, status = "completed", extra = {}) => ({
  id: `t${n}`, profile: "plan", cwd: "/w", title: `title ${n}`, prompt: `secret prompt ${n}`, origin: "ui", status,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(), ...extra,
});

test("prompt is never sent; title and the other fields stay", () => {
  const { tasks, truncated } = list.shapeTaskList([task(1, "completed", { result: "ok", sessionId: "s" })]);
  assert.equal("prompt" in tasks[0], false);
  assert.deepEqual(tasks[0], { id: "t1", profile: "plan", cwd: "/w", title: "title 1", origin: "ui", status: "completed", createdAt: "2026-01-01T00:00:01.000Z", result: "ok", sessionId: "s" });
  assert.equal(truncated, undefined);
});

test("queued and running tasks are always kept; only the newest `limit` others remain; newest first", () => {
  const input = [task(1, "running"), task(2, "queued"), ...Array.from({ length: 10 }, (_, i) => task(10 + i))];
  const { tasks, truncated } = list.shapeTaskList(input, 3);
  assert.deepEqual(tasks.map((t) => t.id), ["t19", "t18", "t17", "t2", "t1"]);
  assert.equal(truncated, true);
});

test("the default cap is 200 non-active tasks", () => {
  const input = [task(0, "queued"), ...Array.from({ length: 250 }, (_, i) => task(i + 1))];
  const { tasks, truncated } = list.shapeTaskList(input);
  assert.equal(tasks.length, 201);
  assert.equal(tasks.filter((t) => t.status === "queued").length, 1);
  assert.equal(truncated, true);
});

test("result and error are clipped to 2000 chars; shorter text and absent fields are untouched", () => {
  const long = "x".repeat(5000);
  const { tasks } = list.shapeTaskList([task(1, "failed", { error: long }), task(2, "completed", { result: long }), task(3, "completed", { result: "short" }), task(4)]);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  assert.equal(byId.t1.error.length, 2001);
  assert.equal(byId.t2.result.length, 2001);
  assert.equal(byId.t3.result, "short");
  assert.equal("result" in byId.t4, false);
  assert.equal("error" in byId.t4, false);
});
