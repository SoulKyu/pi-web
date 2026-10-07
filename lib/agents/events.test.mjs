import assert from "node:assert/strict";
import test from "node:test";
const ev = await (await import("jiti")).createJiti(import.meta.url).import("./events.ts");

test("builders produce version 1 data; webhook text is clipped", () => {
  assert.deepEqual(ev.buildScheduleEvent({ taskId: "t1", triggerId: "g1", title: "night check" }), { version: 1, kind: "schedule", taskId: "t1", triggerId: "g1", title: "night check" });
  assert.deepEqual(ev.buildTaskEvent({ taskId: "t2", title: "digest" }), { version: 1, kind: "task", taskId: "t2", title: "digest" });
  const hook = ev.buildWebhookEvent({ taskId: "t3", triggerId: "g1", title: "x".repeat(100), status: "completed", summary: "y".repeat(5000), runSessionId: "s9" });
  assert.equal(hook.title.length, 80);
  assert.equal(hook.summary.length, 2001);
  assert.ok(hook.summary.endsWith("…"));
  assert.equal(hook.runSessionId, "s9");
});

test("isAgentEventData is a strict guard", () => {
  assert.equal(ev.isAgentEventData({ version: 1, kind: "task", taskId: "t", title: "x" }), true);
  assert.equal(ev.isAgentEventData({ version: 1, kind: "webhook", taskId: "t", triggerId: "g", title: "x", status: "completed", summary: "s" }), true);
  assert.equal(ev.isAgentEventData({ version: 2, kind: "task", taskId: "t", title: "x" }), false);
  assert.equal(ev.isAgentEventData({ version: 1, kind: "webhook", taskId: "t", title: "x" }), false);
  assert.equal(ev.isAgentEventData({ version: 1, kind: "other", taskId: "t", title: "x" }), false);
  assert.equal(ev.isAgentEventData(null), false);
});

test("UI mapping, event prompts and dedupe", () => {
  const card = ev.agentEventToUiMessage(ev.buildTaskEvent({ taskId: "t2", title: "digest" }), 5);
  assert.equal(card.role, "custom");
  assert.equal(card.customType, "agent-event");
  assert.equal(card.content, "digest");
  assert.equal(card.timestamp, 5);
  const hookCard = ev.agentEventToUiMessage(ev.buildWebhookEvent({ taskId: "t3", triggerId: "g", title: "alert", status: "failed", summary: "boom" }));
  assert.equal(hookCard.content, "boom");
  const messages = [card, { role: "user", content: "run the digest" }, { role: "assistant", content: [] }, hookCard, { role: "user", content: "what?" }];
  assert.deepEqual([...ev.eventPromptIndexes(messages)], [1]); // not after a webhook card
  assert.equal(ev.isSameEvent(card, ev.buildTaskEvent({ taskId: "t2", title: "renamed" })), true);
  assert.equal(ev.isSameEvent(card, ev.buildScheduleEvent({ taskId: "t2", triggerId: "g", title: "digest" })), false);
});

test("appendEntryId pads to the message count and never shrinks", () => {
  assert.deepEqual(ev.appendEntryId(["a", "b"], 2, "c"), ["a", "b", "c"]);
  const padded = ev.appendEntryId(["a"], 3, "c");
  assert.equal(padded.length, 4);
  assert.equal(padded[1], undefined);
  assert.equal(padded[3], "c");
  assert.deepEqual(ev.appendEntryId(["a", "b", "c"], 1, "d"), ["a", "b", "c", "d"]);
});

test("webhookEventOfTask maps a terminal webhook task to a card, never a cancelled or legacy one", () => {
  const base = { id: "t9", triggerId: "g1", title: "[alertmanager] alert", sessionId: "run-1" };
  assert.deepEqual(ev.webhookEventOfTask({ ...base, status: "completed", result: "same pod, PR #142 not merged yet" }), { version: 1, kind: "webhook", taskId: "t9", triggerId: "g1", title: "[alertmanager] alert", status: "completed", summary: "same pod, PR #142 not merged yet", runSessionId: "run-1" });
  assert.equal(ev.webhookEventOfTask({ ...base, status: "failed", error: "timeout after 1800000 ms" }).summary, "timeout after 1800000 ms");
  assert.equal(ev.webhookEventOfTask({ ...base, status: "cancelled" }), null);
  assert.equal(ev.webhookEventOfTask({ ...base, triggerId: undefined, status: "completed", result: "x" }), null);
});

test("a schedule or task card may carry a fireReason, and only a well-formed one", () => {
  const base = ev.buildTaskEvent({ taskId: "t", title: "x" });
  assert.ok(ev.isAgentEventData({ ...base, fireReason: { source: "schedule", bucket: 3 } }));
  assert.ok(!ev.isAgentEventData({ ...base, fireReason: { source: "nope" } }));
  assert.ok(!ev.isAgentEventData({ ...base, fireReason: "schedule" }));
  assert.equal(ev.buildScheduleEvent({ taskId: "t", triggerId: "g", title: "x", fireReason: { source: "schedule", bucket: 1 } }).fireReason.bucket, 1);
});

test("an isolated schedule task yields a card carrying taskKind schedule; the guard accepts it and rejects a bad taskKind", () => {
  const card = ev.webhookEventOfTask({ id: "t1", triggerId: "g1", title: "nightly", status: "completed", result: "ok", kind: "schedule" });
  assert.equal(card.kind, "webhook");
  assert.equal(card.taskKind, "schedule");
  assert.equal(ev.isAgentEventData(card), true);
  assert.equal(ev.isAgentEventData({ ...card, taskKind: "other" }), false);
  assert.equal("taskKind" in ev.webhookEventOfTask({ id: "t2", triggerId: "g1", title: "x", status: "completed", result: "ok", kind: "webhook" }), false);
});
