import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-agentops-tasks-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const route = await jiti.import("./route.ts");
const tasks = await jiti.import("@/lib/agent-ops/task-store.ts");

test("GET lists every agent's tasks without prompts, no-store; no other method", async () => {
  tasks.createTask({ profile: "a", cwd: "/h", title: "one", prompt: "secret", origin: "ui", agent: "a" });
  tasks.createTask({ profile: "b", cwd: "/h", title: "two", prompt: "secret", origin: "agent", agent: "b", requestedBy: "a" });
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.deepEqual(body.tasks.map((t) => t.agent).sort(), ["a", "b"]);
  assert.equal(body.tasks.some((t) => "prompt" in t), false);
  assert.equal(body.truncated, undefined);
  assert.equal(route.POST, undefined);
});
