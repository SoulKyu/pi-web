import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-agentops-cascade-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { DELETE } = await jiti.import("./[id]/route.ts");
const tasks = await jiti.import("@/lib/agent-ops/task-store.ts");
const settings = await jiti.import("@/lib/agent-ops/settings.ts");
settings.updateAgentOpsSettings({ minFreeMb: 100_000_000 });

const mk = (extra) => tasks.createTask({ profile: "p", cwd: "/h", title: "t", prompt: "p", origin: "agent", ...extra });
const del = (id) => DELETE(new Request("http://localhost/x", { method: "DELETE", headers: { host: "localhost" } }), { params: Promise.resolve({ id }) });

test("cancelling a task also cancels its queued children and counts them", async () => {
  const parent = mk({});
  const child = mk({ parentTaskId: parent.id });
  const runningChild = mk({ parentTaskId: parent.id });
  tasks.claimTask(runningChild.id);
  const unrelated = mk({});
  const body = await (await del(parent.id)).json();
  assert.equal(body.task.status, "cancelled");
  assert.equal(body.cancelledChildren, 1);
  assert.equal(tasks.getTask(child.id).status, "cancelled");
  assert.equal(tasks.getTask(runningChild.id).status, "running");
  assert.equal(tasks.getTask(unrelated.id).status, "queued");
});
