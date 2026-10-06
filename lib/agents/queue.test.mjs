import assert from "node:assert/strict";
import test from "node:test";
const { selectIsolatedTasks, selectThreadTasks } = await (await import("jiti")).createJiti(import.meta.url).import("./queue.ts");
const task = (id, over) => ({ id, profile: "p", cwd: "/h", title: id, prompt: "p", origin: "ui", status: "queued", createdAt: `2026-01-01T00:00:${id.padStart(2, "0")}Z`, ...over });

test("one thread task per agent, oldest first, none for an agent with a running thread task or a busy thread (Review Focus 3)", () => {
  const queued = [
    task("03", { agent: "a", target: "thread" }), task("01", { agent: "a", target: "thread" }),
    task("02", { agent: "b", target: "thread" }), task("04", { agent: "c", target: "thread" }), task("05", { target: "isolated", agent: "a" }),
  ];
  const all = [...queued, task("00", { agent: "b", target: "thread", status: "running" })];
  const picked = selectThreadTasks(queued, all, (agent) => agent === "c");
  assert.deepEqual(picked.map((t) => t.id), ["01"]);
  assert.deepEqual(selectIsolatedTasks(queued).map((t) => t.id), ["05"]);
});
test("legacy tasks without a target are isolated", () => {
  assert.deepEqual(selectIsolatedTasks([task("01", {})]).map((t) => t.id), ["01"]);
  assert.deepEqual(selectThreadTasks([task("01", {})], [], () => false), []);
});
