import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-thread-run-"));
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { startThreadEventRun, waitUntilIdle, eventOfTask } = await jiti.import("./thread-run.ts");

function fakeSession({ running = false } = {}) {
  const listeners = new Set();
  const sent = [];
  const entries = [];
  const session = {
    running,
    isRunning: () => session.running,
    onEvent: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    emit: (event) => { for (const listener of [...listeners]) listener(event); },
    send: async (command) => { sent.push(command); return command.type === "get_last_assistant_text" ? { text: "done text" } : undefined; },
    shutdown: async () => {}, waitUntilReady: async () => {},
    appendDisplayEntry: (customType, data) => { entries.push({ customType, data }); return `e${entries.length}`; },
    sent, entries,
  };
  return session;
}
const task = { id: "t1", agent: "leandro", target: "thread", kind: "schedule", triggerId: "g1", profile: "leandro", cwd: "/h", title: "night check", prompt: "check the pods", origin: "trigger", status: "running", createdAt: "x" };
const agent = { name: "leandro", home: "/h", avatar: { emoji: "x", color: "#000000" }, createdAt: "x", role: "r", toolsPreset: "full" };

test("eventOfTask", () => {
  assert.deepEqual(eventOfTask(task), { version: 1, kind: "schedule", taskId: "t1", triggerId: "g1", title: "night check" });
  assert.deepEqual(eventOfTask({ ...task, kind: "task", triggerId: undefined }), { version: 1, kind: "task", taskId: "t1", title: "night check" });
});

test("waits for the user's turn to settle before appending the card and sending the prompt (Review Focus 3)", async () => {
  const session = fakeSession({ running: true });
  const starting = startThreadEventRun(task, { open: async () => ({ session, sessionId: "sid" }), readAgent: () => agent, readTask: () => task });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(session.entries.length, 0);
  assert.equal(session.sent.length, 0);
  session.emit({ type: "prompt_done" });           // the user's turn ends, but the wrapper still reports running
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(session.entries.length, 0);
  session.running = false;
  session.emit({ type: "agent_settled" });
  const handle = await starting;
  assert.equal(handle.sessionId, "sid");
  assert.deepEqual(session.entries, [{ customType: "pi-web:agent-event", data: eventOfTask(task) }]);
  assert.deepEqual(session.sent[0], { type: "prompt", message: "check the pods", origin: "agent-ops" });
  session.emit({ type: "message_end", message: { role: "assistant", stopReason: "stop", usage: { input: 3, output: 1 } } });
  assert.equal(handle.usage().turns, 1);
  assert.equal(handle.usage().input, 3);
  session.emit({ type: "prompt_done" });
  assert.deepEqual(await handle.done, { status: "completed", result: "done text" });
  await handle.abort();
  assert.deepEqual(session.sent.at(-1), { type: "abort" }); // the session stays open: no shutdown was sent
});

test("waitUntilIdle resolves at once when idle", async () => {
  await waitUntilIdle(fakeSession());
});

test("waitUntilIdle resolves on any event once idle (a !bash or compaction turn settles silently)", async () => {
  const session = fakeSession({ running: true });
  const waiting = waitUntilIdle(session);
  session.running = false;
  session.emit({ type: "tool_execution_end" });
  await waiting;
});

test("a task cancelled during the idle wait gets no card, no prompt", async () => {
  const session = fakeSession({ running: true });
  let current = task;
  const starting = startThreadEventRun(task, { open: async () => ({ session, sessionId: "sid" }), readAgent: () => agent, readTask: () => current });
  const rejected = assert.rejects(starting, /cancelled/);
  await new Promise((resolve) => setTimeout(resolve, 10));
  current = { ...task, status: "cancelled" };
  session.running = false;
  session.emit({ type: "agent_settled" });
  await rejected;
  assert.equal(session.entries.length, 0);
  assert.equal(session.sent.length, 0);
});

test("an unknown agent fails the task", async () => {
  await assert.rejects(startThreadEventRun(task, { open: async () => { throw new Error("unreachable"); }, readAgent: () => null }), /long-term agent not found/);
});

test("a trigger task whose agent reached the daily budget gets no card and no prompt", async () => {
  const session = fakeSession();
  await assert.rejects(
    startThreadEventRun(task, { open: async () => ({ session, sessionId: "sid" }), readAgent: () => agent, readTask: () => task, budgetRefusal: () => "daily cost budget reached" }),
    /daily cost budget reached/,
  );
  assert.equal(session.entries.length, 0);
  assert.equal(session.sent.length, 0);
});

test("a task requested by another agent gets the delegation prefix with the running agent's home", async () => {
  const delegated = { ...task, kind: "task", triggerId: undefined, origin: "agent", requestedBy: "alice", prompt: "review PR 12" };
  const session = fakeSession();
  await startThreadEventRun(delegated, { open: async () => ({ session, sessionId: "sid" }), readAgent: () => agent, readTask: () => delegated, budgetRefusal: () => null });
  assert.equal(session.sent[0].message, "[Request from agent alice, not from the user. Put files meant for alice under /h/outbox/t1/ and cite absolute paths in your answer.]\n\nreview PR 12");
});

test("no prefix when requested by the user or by nobody", async () => {
  for (const requestedBy of ["user", undefined]) {
    const plain = { ...task, kind: "task", triggerId: undefined, requestedBy };
    const session = fakeSession();
    await startThreadEventRun(plain, { open: async () => ({ session, sessionId: "sid" }), readAgent: () => agent, readTask: () => plain, budgetRefusal: () => null });
    assert.equal(session.sent[0].message, "check the pods");
  }
});

test("a user hand-over's task card carries handedFrom; an agent request and a plain task do not", () => {
  const plain = { ...task, kind: "task", triggerId: undefined };
  assert.equal(eventOfTask({ ...plain, requestedBy: "user", deliverTo: "Julien" }).handedFrom, "Julien");
  assert.equal("handedFrom" in eventOfTask({ ...plain, requestedBy: "alice", deliverTo: "alice" }), false);
  assert.equal("handedFrom" in eventOfTask({ ...plain, requestedBy: "user" }), false);
});
