import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
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

const agentInput = { name: "leandro", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } };

test("ensureThread starts one trusted session per agent and stores its id; later calls reuse it", async () => {
  const agent = reg.createLongTermAgent(agentInput);
  const starts = [];
  const deps = {
    start: async (key, file, cwd, options) => { starts.push({ key, file, cwd, options }); return { session: { sessionFile: "/tmp/t.jsonl" }, realSessionId: "sid-1" }; },
    resolvePath: async (id) => (id === "sid-1" ? "/tmp/t.jsonl" : null),
    readAgent: reg.getLongTermAgent,
  };
  const [a, b] = await Promise.all([thread.ensureThread(agent, deps), thread.ensureThread(agent, deps)]); // concurrent opens: one start
  assert.deepEqual(a, { sessionId: "sid-1", path: "/tmp/t.jsonl" });
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
    start: async () => ({ session: { sessionFile: "/tmp/t2.jsonl" }, realSessionId: "sid-2" }),
    resolvePath: async (id) => (id === "sid-2" ? "/tmp/t2.jsonl" : null), // sid-1 no longer resolves
    readAgent: reg.getLongTermAgent,
  };
  const result = await thread.ensureThread(reg.getLongTermAgent("leandro"), deps);
  assert.equal(result.sessionId, "sid-2");
  assert.equal(reg.getLongTermAgent("leandro").threadSessionId, "sid-2");
});
