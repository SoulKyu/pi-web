import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-runner-")); // avant l'import
const store = await (await import("jiti")).createJiti(import.meta.url).import("./task-store.ts");
const { readRunRecords } = await (await import("jiti")).createJiti(import.meta.url).import("./run-registry.ts");
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

test("global cap holds across concurrent runPendingTasks calls and the queue drains", async () => {
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(store.createTask({ ...base, profile: "a" }).id);
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
  while (store.listTasks().some((t) => t.status === "queued")) await runPendingTasks(deps);
  assert.equal(peak, deps.maxConcurrent);
  assert.deepEqual(ids.map((id) => store.getTask(id).status), ["completed", "completed", "completed", "completed"]);
});

test("oldest queued task starts first", async () => {
  const older = store.createTask({ ...base, profile: "a" });
  await new Promise((r) => setTimeout(r, 3));
  const newer = store.createTask({ ...base, profile: "a" });
  const started = [];
  const deps = {
    maxConcurrent: 1,
    start: async (task) => {
      started.push(task.id);
      return { sessionId: "s", done: Promise.resolve({ status: "completed" }), abort: noAbort };
    },
  };
  await runPendingTasks(deps);
  await runPendingTasks(deps);
  assert.deepEqual(started, [older.id, newer.id]);
});

test("maxRunMs bounds a start that never resolves, frees the slot, no unhandled rejection", async () => {
  const stuck = store.createTask({ ...base, profile: "a" });
  await new Promise((r) => setTimeout(r, 3));
  const next = store.createTask({ ...base, profile: "b" });
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on("unhandledRejection", onUnhandled);
  const deps = {
    maxConcurrent: 1,
    maxRunMs: 20,
    start: async (task) => {
      if (task.id === stuck.id) return new Promise(() => {});
      return { sessionId: "s-next", done: Promise.resolve({ status: "completed", result: "ok" }), abort: noAbort };
    },
  };
  await runPendingTasks(deps);
  assert.equal(store.getTask(stuck.id).status, "failed");
  assert.match(store.getTask(stuck.id).error, /timeout/);
  await runPendingTasks(deps);
  assert.equal(store.getTask(next.id).status, "completed");
  await new Promise((r) => setTimeout(r, 10));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, 0);
});

test("a session that starts after the timeout is still aborted", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  let aborted = false;
  let unhandled = 0;
  const onUnhandled = () => { unhandled++; };
  process.on("unhandledRejection", onUnhandled);
  const deps = {
    maxConcurrent: 1,
    maxRunMs: 10,
    start: async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { sessionId: "s-late", done: Promise.reject(new Error("late")), abort: async () => { aborted = true; } };
    },
  };
  await runPendingTasks(deps);
  assert.equal(store.getTask(t.id).status, "failed");
  await new Promise((r) => setTimeout(r, 50));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(aborted, true);
  assert.equal(unhandled, 0);
});

test("an abort that never resolves on the timeout path still frees the slot", async () => {
  const hung = store.createTask({ ...base, profile: "a" });
  await new Promise((r) => setTimeout(r, 3));
  const next = store.createTask({ ...base, profile: "b" });
  const deps = {
    maxConcurrent: 1,
    maxRunMs: 20,
    start: async (task) => task.id === hung.id
      ? { sessionId: "s-hung", done: new Promise(() => {}), abort: () => new Promise(() => {}) }
      : { sessionId: "s-next", done: Promise.resolve({ status: "completed", result: "ok" }), abort: noAbort },
  };
  await runPendingTasks(deps);
  assert.equal(store.getTask(hung.id).status, "failed");
  await runPendingTasks(deps);
  assert.equal(store.getTask(next.id).status, "completed");
});

test("onRunEnd starts the next queued task once the slot is free (cap 1, no further external call)", async () => {
  const first = store.createTask({ ...base, profile: "chain-1" });
  await new Promise((r) => setTimeout(r, 5)); // distinct createdAt: FIFO order is by timestamp
  const second = store.createTask({ ...base, profile: "chain-2" });
  const started = [];
  const deps = {
    maxConcurrent: 1,
    start: async (task) => {
      started.push(task.profile);
      return { sessionId: "s", done: Promise.resolve({ status: "completed", result: "ok" }), abort: noAbort };
    },
    onRunEnd: () => void runPendingTasks(deps),
  };
  await runPendingTasks(deps);
  for (let i = 0; i < 100 && store.getTask(second.id).status !== "completed"; i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(started.filter((p) => p.startsWith("chain-")), ["chain-1", "chain-2"]);
  assert.equal(store.getTask(first.id).status, "completed");
  assert.equal(store.getTask(second.id).status, "completed");
});

test("select limits the batch, slotKey separates counters, onTaskEnd sees the terminal record", async () => {
  const a = store.createTask({ ...base, profile: "a", target: "thread", agent: "x" });
  const b = store.createTask({ ...base, profile: "b" });
  const ended = [];
  await runPendingTasks({
    maxConcurrent: 2, slotKey: "__agentOpsThreadRunning",
    select: (queued) => queued.filter((t) => t.target === "thread"),
    start: async () => ({ sessionId: "s", done: Promise.resolve({ status: "completed", result: "ok" }), abort: noAbort }),
    onTaskEnd: (task) => ended.push([task.id, task.status]),
  });
  assert.equal(store.getTask(a.id).status, "completed");
  assert.equal(store.getTask(b.id).status, "queued"); // not selected
  assert.deepEqual(ended, [[a.id, "completed"]]);
  assert.equal(globalThis.__agentOpsThreadRunning, 0);
  assert.equal(globalThis.__agentOpsRunning ?? 0, 0);
  store.claimTask(b.id); store.updateTask(b.id, { status: "cancelled", completedAt: new Date().toISOString() });
});

test("capacity() overrides the slot count: 0 starts nothing, 1 starts one of two queued tasks", async () => {
  const a = store.createTask({ ...base, profile: "a" });
  await new Promise((r) => setTimeout(r, 3));
  const b = store.createTask({ ...base, profile: "a" });
  const started = [];
  const deps = {
    maxConcurrent: 5,
    start: async (task) => { started.push(task.id); return { sessionId: "s", done: Promise.resolve({ status: "completed", result: "x" }), abort: noAbort }; },
  };
  await runPendingTasks({ ...deps, capacity: () => 0 });
  assert.deepEqual(started, []);
  await runPendingTasks({ ...deps, capacity: () => 1 });
  assert.deepEqual(started, [a.id]);
  assert.equal(store.getTask(b.id).status, "queued");
  await runPendingTasks(deps);
  assert.deepEqual(started, [a.id, b.id]);
});

test("a finished run stores its usage on the task and appends one record to runs.jsonl", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 3, toolCalls: 0 };
  await runPendingTasks({ maxConcurrent: 2, start: async () => ({ sessionId: "s-u", done: Promise.resolve({ status: "completed" }), abort: noAbort, usage: () => usage }) });
  assert.equal(store.getTask(t.id).usage.turns, 3);
  const records = readRunRecords().filter((r) => r.taskId === t.id);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "completed");
  assert.equal(records[0].sessionId, "s-u");
  assert.equal(records[0].usage.turns, 3);
});

test("a run record carries billing from the provider; a subscription provider without a price has no costEquivalent", async () => {
  const t = store.createTask({ ...base, profile: "a" });
  const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1, toolCalls: 0, provider: "claude-bridge", model: "no-such-model" };
  await runPendingTasks({ maxConcurrent: 2, start: async () => ({ sessionId: "s-b", done: Promise.resolve({ status: "completed" }), abort: noAbort, usage: () => usage }) });
  const [record] = readRunRecords().filter((r) => r.taskId === t.id);
  assert.equal(record.billing, "subscription");
  assert.equal(record.costEquivalent, undefined);
});
