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
