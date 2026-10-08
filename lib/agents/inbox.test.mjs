import assert from "node:assert/strict";
import test from "node:test";
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { inboxItems } = await jiti.import("./inbox.ts");

const ts = (m) => new Date(Date.UTC(2026, 9, 7, 12, m)).toISOString();
const user = (id, m) => ({ type: "message", id, timestamp: ts(m), message: { role: "user", content: "q" } });
const reply = (id, m, text) => ({ type: "message", id, timestamp: ts(m), message: { role: "assistant", content: [{ type: "text", text }] } });
const card = (id, m, data) => ({ type: "custom", id, timestamp: ts(m), customType: "pi-web:agent-event", data: { version: 1, taskId: "t", ...data } });
const recall = (id, m) => ({ type: "custom", id, timestamp: ts(m), customType: "pi-mem0:recall", data: { version: 1, query: "q", ms: 1, hits: [] } });
const now = Date.parse(ts(60));
const task = (title, status, m, agent = "a") => ({ agent, title, status, completedAt: ts(m) });

const entries = [
  reply("old", 1, "before"), user("mark", 10),
  card("c1", 20, { kind: "webhook", triggerId: "x", title: "Deploy", status: "failed", summary: "s" }),
  recall("r1", 21),
  card("c2", 30, { kind: "task", title: "Daily" }),
  reply("a1", 40, "  first   reply\nhere "), reply("a2", 50, "x".repeat(200)),
];

test("inboxItems lists cards and replies after the marker, newest first, recall excluded", () => {
  const items = inboxItems({ name: "a", lastReadEntryId: "mark" }, entries, [], now);
  assert.deepEqual(items.map((i) => i.entryId), ["a2", "a1", "c2", "c1"]);
  assert.equal(items[0].kind, "reply");
  assert.equal(items[0].title.length, 80);
  assert.equal(items[1].title, "first reply here");
  assert.equal(items[2].detail, undefined);
  assert.deepEqual([items[3].kind, items[3].title, items[3].detail], ["card", "Deploy", "failed"]);
});

test("terminal tasks count only after the marker's time, for this agent; queued ones never", () => {
  const tasks = [task("after", "completed", 45), task("before", "failed", 5), task("other", "completed", 45, "b"), task("run", "running", 45), { ...task("none", "completed", 45), completedAt: undefined }];
  const items = inboxItems({ name: "a", lastReadEntryId: "mark" }, entries, tasks, now).filter((i) => i.kind === "task");
  assert.deepEqual(items.map((i) => [i.title, i.detail, i.entryId]), [["after", "completed", undefined]]);
});

test("no or unknown marker: every entry, and tasks of the last 24 h only", () => {
  const tasks = [task("recent", "cancelled", 59), { agent: "a", title: "ancient", status: "completed", completedAt: new Date(now - 25 * 3_600_000).toISOString() }];
  for (const lastReadEntryId of [undefined, "zzz"]) {
    const items = inboxItems({ name: "a", lastReadEntryId }, entries, tasks, now);
    assert.equal(items.filter((i) => i.entryId).length, 5); // old, c1, c2, a1, a2: user and recall excluded
    assert.deepEqual(items.filter((i) => i.kind === "task").map((i) => i.title), ["recent"]);
  }
});

test("capped at 50 per agent", () => {
  const many = Array.from({ length: 80 }, (_, i) => reply(`m${i}`, i % 50, `r${i}`));
  assert.equal(inboxItems({ name: "a" }, many, [], now).length, 50);
});
