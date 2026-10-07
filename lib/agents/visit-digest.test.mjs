import assert from "node:assert/strict";
import test from "node:test";
const digest = await (await import("jiti")).createJiti(import.meta.url).import("./visit-digest.ts");

const text = (value) => ({ role: "assistant", content: [{ type: "text", text: value }] });
const card = (data) => ({ role: "custom", customType: "agent-event", content: "", display: true, details: data });
const hook = (status) => card({ version: 1, kind: "webhook", taskId: "t", triggerId: "g", title: "x", status, summary: "s" });
const notify = { role: "assistant", content: [{ type: "toolCall", toolCallId: "c", toolName: "agent_notify", arguments: {} }] };

const messages = [
  text("before the marker"), hook("failed"),
  text("one"), card({ version: 1, kind: "schedule", taskId: "a", title: "s" }), hook("failed"), hook("completed"),
  card({ version: 1, kind: "task", taskId: "b", title: "t" }), notify, text("two"), text("  "),
  { role: "custom", customType: "memory-recall", content: "", display: true, details: {} },
];
const ids = messages.map((_, i) => `e${i}`);
const t = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;

test("digestSince counts only messages after the marker", () => {
  assert.deepEqual(digest.digestSince(messages, ids, "e1"), { replies: 2, schedules: 1, tasks: 1, webhooks: 2, webhookFailed: 1, notifies: 1, recalls: 1 });
});

test("digestSince counts everything loaded when the marker is absent or unknown", () => {
  const all = digest.digestSince(messages, ids, null);
  assert.equal(all.replies, 3);
  assert.equal(all.webhookFailed, 2);
  assert.deepEqual(digest.digestSince(messages, ids, "gone"), all);
});

test("digestLine joins non-zero parts and is empty when all are zero", () => {
  const d = digest.digestSince(messages, ids, "e1");
  assert.equal(
    digest.digestLine(d, t),
    'agents.digest.runsFailed:{"count":4,"failed":1} · agents.digest.alerts:{"count":2} · agents.digest.replies:{"count":2} · agents.digest.notifies:{"count":1} · agents.digest.recalls:{"count":1}',
  );
  assert.equal(digest.digestLine(digest.digestSince(messages, ids, "e10"), t), "");
  const clean = digest.digestSince([card({ version: 1, kind: "task", taskId: "b", title: "t" })], ["x"], null);
  assert.equal(digest.digestLine(clean, t), 'agents.digest.runs:{"count":1}');
});
