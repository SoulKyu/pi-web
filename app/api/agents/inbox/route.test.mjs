import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-agents-inbox-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const route = await jiti.import("./route.ts");
const reg = await jiti.import("@/lib/agents/registry.ts");
const tasks = await jiti.import("@/lib/agent-ops/task-store.ts");
const input = { role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } };

test("GET: 200 no-store, agents with nothing to show are omitted, finished tasks listed", async () => {
  reg.createLongTermAgent({ name: "quiet", ...input });
  reg.createLongTermAgent({ name: "busy", ...input });
  const task = tasks.createTask({ profile: "busy", cwd: "/h", title: "Report", prompt: "p", origin: "ui", agent: "busy" });
  tasks.updateTask(task.id, { status: "completed", completedAt: new Date().toISOString() });
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(typeof body.generatedAt, "string");
  assert.deepEqual(body.agents.map((a) => a.name), ["busy"]);
  assert.equal(body.agents[0].unread, 0);
  assert.deepEqual(body.agents[0].items.map((i) => [i.kind, i.title, i.detail]), [["task", "Report", "completed"]]);
  assert.equal(route.POST, undefined);
});

test("source: one thread read per agent, no second status read, no poller", async () => {
  const src = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.equal(src.match(/threadEntries\(/g).length, 1);
  assert.doesNotMatch(src, /threadStatus|unreadCount|setInterval/);
});
