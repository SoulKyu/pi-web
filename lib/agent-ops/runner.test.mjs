import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-runner-")); // avant l'import
const store = await (await import("jiti")).createJiti(import.meta.url).import("./task-store.ts");
const { runPendingTasks } = await (await import("jiti")).createJiti(import.meta.url).import("./runner.ts");

const base = { cwd: "/p", title: "t", prompt: "p", origin: "ui" };
const noAbort = async () => {};

test("completes with result once done resolves; fails on start/done rejection", async () => {
  const a = store.createTask({ ...base, profile: "a" });
  const g = store.createTask({ ...base, profile: "ghost" });
  const deps = {
    maxConcurrent: 2,
    start: async (task) => {
      if (task.profile === "ghost") throw new Error("Unknown or disabled agent profile: ghost");
      return { sessionId: "s-" + task.profile, done: Promise.resolve({ status: "completed", result: "final text" }), abort: noAbort };
    },
  };
  await runPendingTasks(deps);
  const ok = store.getTask(a.id);
  assert.equal(ok.status, "completed");
  assert.equal(ok.sessionId, "s-a");
  assert.equal(ok.result, "final text");
  const bad = store.getTask(g.id);
  assert.equal(bad.status, "failed");
  assert.match(bad.error, /Unknown or disabled/);
  assert.equal(store.listTasks().some((t) => t.status === "queued"), false);
});

test("done rejection (prompt_error or provider stopReason error) marks failed, claim released", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  const deps = { maxConcurrent: 2, start: async () => ({ sessionId: "s", done: Promise.reject(new Error("Provider returned an error")), abort: noAbort }) };
  await runPendingTasks(deps);
  const task = store.getTask(t.id);
  assert.equal(task.status, "failed");
  assert.match(task.error, /Provider returned an error/);
  assert.equal(store.listTasks().filter((x) => x.status === "running").length, 0);
});

test("aborted outcome marks the task cancelled", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  const deps = { maxConcurrent: 2, start: async () => ({ sessionId: "s", done: Promise.resolve({ status: "cancelled" }), abort: noAbort }) };
  await runPendingTasks(deps);
  assert.equal(store.getTask(t.id).status, "cancelled");
});

test("terminal race: a task cancelled mid-start is aborted, keeps its status and session id, no unhandled rejection", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  let aborted = false;
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on("unhandledRejection", onUnhandled);
  const deps = {
    maxConcurrent: 2,
    start: async (task) => {
      // the cancel route wins the race mid-start; done then rejects late
      store.updateTask(task.id, { status: "cancelled", completedAt: new Date().toISOString() });
      return { sessionId: "s-race", done: new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 5)), abort: async () => { aborted = true; } };
    },
  };
  await runPendingTasks(deps);
  await new Promise((r) => setTimeout(r, 20));
  process.off("unhandledRejection", onUnhandled);
  const task = store.getTask(t.id);
  assert.equal(task.status, "cancelled");
  assert.equal(task.sessionId, "s-race");
  assert.equal(task.result, undefined);
  assert.equal(aborted, true);
  assert.equal(unhandled, 0);
});

test("maxRunMs: a hung run is aborted and failed with timeout", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  let aborted = false;
  const deps = {
    maxConcurrent: 2,
    maxRunMs: 20,
    start: async () => ({ sessionId: "s", done: new Promise(() => {}), abort: async () => { aborted = true; } }),
  };
  await runPendingTasks(deps);
  const task = store.getTask(t.id);
  assert.equal(aborted, true);
  assert.equal(task.status, "failed");
  assert.match(task.error, /timeout/);
});

test("global cap holds across concurrent runPendingTasks calls", async () => {
  for (let i = 0; i < 4; i++) store.createTask({ ...base, profile: "a" });
  let inFlight = 0;
  let peak = 0;
  const deps = {
    maxConcurrent: 1,
    start: async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      return { sessionId: "s", done: new Promise((r) => setTimeout(() => { inFlight--; r({ status: "completed", result: "x" }); }, 10)), abort: noAbort };
    },
  };
  await Promise.all([runPendingTasks(deps), runPendingTasks(deps), runPendingTasks(deps)]);
  assert.equal(peak <= deps.maxConcurrent, true);
});
