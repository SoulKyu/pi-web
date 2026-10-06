import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agents-thread-")); // before the import
const jiti = (await import("jiti")).createJiti(import.meta.url);
const reg = await jiti.import("./registry.ts");
const thread = await jiti.import("./thread.ts");

const user = (id) => ({ type: "message", id, parentId: null, message: { role: "user", content: "q" } });
const assistant = (id) => ({ type: "message", id, parentId: null, message: { role: "assistant", content: [{ type: "text", text: "a" }] } });
const system = (id) => ({ type: "message", id, parentId: null, message: { role: "system", content: "s" } });

test("countUnread counts assistant replies after the marker; unknown or absent marker counts everything (Review Focus 4)", () => {
  const entries = [user("u1"), assistant("a1"), system("s1"), user("u2"), assistant("a2"), assistant("a3")];
  assert.equal(thread.countUnread(entries, "a1"), 2);
  assert.equal(thread.countUnread(entries, "a3"), 0);
  assert.equal(thread.countUnread(entries, undefined), 3);
  assert.equal(thread.countUnread(entries, "zzzz"), 3);
  assert.equal(thread.countUnread([], "a1"), 0);
});

test("unreadCount returns 0 instead of throwing when the thread file is unreadable", async () => {
  const unreadable = mkdtempSync(join(tmpdir(), "thread-unreadable-"));
  const agent = { threadSessionId: "thread-x", lastReadEntryId: undefined };
  const throwing = () => { throw new Error("corrupt"); };
  assert.equal(await thread.unreadCount(agent, { resolvePath: async () => unreadable, readEntries: throwing }), 0);
  assert.equal(await thread.unreadCount(agent, { resolvePath: async () => { throw new Error("boom"); }, readEntries: throwing }), 0);
});

const dir = mkdtempSync(join(tmpdir(), "thread-files-"));
const fakeSession = (file) => ({ sessionFile: file, persistSessionFile: () => writeFileSync(file, "{}\n") });
const agentInput = { name: "leandro", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } };

test("ensureThread starts one trusted session per agent and stores its id; later calls reuse it", async () => {
  const agent = reg.createLongTermAgent(agentInput);
  const starts = [];
  const deps = {
    start: async (key, file, cwd, options) => { starts.push({ key, file, cwd, options }); return { session: fakeSession(join(dir, "t.jsonl")), realSessionId: "sid-1" }; },
    resolvePath: async (id) => (id === "sid-1" ? join(dir, "t.jsonl") : null),
    readAgent: reg.getLongTermAgent,
  };
  const [a, b] = await Promise.all([thread.ensureThread(agent, deps), thread.ensureThread(agent, deps)]); // concurrent opens: one start
  assert.deepEqual(a, { sessionId: "sid-1", path: join(dir, "t.jsonl") });
  assert.equal(existsSync(a.path), true);
  assert.deepEqual(b, a);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].file, "");
  assert.equal(starts[0].cwd, agent.home);
  assert.deepEqual(starts[0].options, { agentProfile: "leandro", agentProfileTrust: "trusted" });
  assert.equal(reg.getLongTermAgent("leandro").threadSessionId, "sid-1");
  await thread.ensureThread(reg.getLongTermAgent("leandro"), deps);
  assert.equal(starts.length, 1);
});

test("a thread whose file vanished is started again (Review Focus 2)", async () => {
  const deps = {
    start: async () => ({ session: fakeSession(join(dir, "t2.jsonl")), realSessionId: "sid-2" }),
    resolvePath: async (id) => (id === "sid-2" ? join(dir, "t2.jsonl") : join(dir, "gone.jsonl")), // warm cache: sid-1 resolves to a deleted file
    readAgent: reg.getLongTermAgent,
  };
  const result = await thread.ensureThread(reg.getLongTermAgent("leandro"), deps);
  assert.equal(result.sessionId, "sid-2");
  assert.equal(reg.getLongTermAgent("leandro").threadSessionId, "sid-2");
});

test("ensureThread rejects with not_found when the agent vanished before the lock", async () => {
  const deps = { start: async () => { throw new Error("must not start"); }, resolvePath: async () => null, readAgent: () => null };
  await assert.rejects(thread.ensureThread({ name: "ghost", home: "/x" }, deps), (e) => e.code === "not_found");
});

test("openThread holds the thread lock across the start", async () => {
  const order = [];
  reg.createLongTermAgent({ ...agentInput, name: "locker" });
  reg.setThreadSessionId("locker", "sid-X");
  const file = join(dir, "x.jsonl");
  writeFileSync(file, "{}\n");
  const deps = {
    start: async () => { await new Promise((r) => setTimeout(r, 50)); order.push("started"); return { session: {}, realSessionId: "sid-X" }; },
    resolvePath: async () => file,
    readAgent: reg.getLongTermAgent,
  };
  const opening = thread.openThread(reg.getLongTermAgent("locker"), deps);
  await new Promise((r) => setTimeout(r, 5));
  const locked = thread.withThreadLock("locker", async () => { order.push("locked"); });
  await Promise.all([opening, locked]);
  assert.deepEqual(order, ["started", "locked"]);
});
