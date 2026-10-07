import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-agentops-retry-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { POST } = await jiti.import("./[id]/route.ts");
const triggers = await jiti.import("@/lib/agent-ops/trigger-store.ts");
const triggerLog = await jiti.import("@/lib/agent-ops/trigger-log.ts");
const tasks = await jiti.import("@/lib/agent-ops/task-store.ts");
const settings = await jiti.import("@/lib/agent-ops/settings.ts");
const reg = await jiti.import("@/lib/agents/registry.ts");

reg.createLongTermAgent({ name: "retry", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } });
settings.updateAgentOpsSettings({ minFreeMb: 100_000_000 }); // no free-memory headroom: the kick after a retry starts no run

const call = (id, body) => POST(new Request("http://localhost/x", { method: "POST", headers: { host: "localhost" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const finished = (input, status = "completed") => {
  const task = tasks.createTask({ profile: "retry", cwd: "/h", title: "t", prompt: "p", origin: "ui", ...input });
  assert.ok(tasks.claimTask(task.id));
  return tasks.updateTask(task.id, { status, completedAt: new Date().toISOString() });
};

test("retry of a completed task creates a new queued task that links back", async () => {
  const source = finished({ agent: "retry", target: "thread", kind: "task", notBefore: "2030-01-01T00:00:00.000Z", tools: ["read"], maxRunMs: 5000 });
  const res = await call(source.id, { action: "retry" });
  assert.equal(res.status, 201);
  const { task } = await res.json();
  assert.notEqual(task.id, source.id);
  assert.equal(task.status, "queued");
  assert.equal(task.retryOf, source.id);
  assert.equal(task.attempt, 2);
  assert.equal(task.fireReason.source, "manual");
  assert.equal(task.notBefore, undefined);
  assert.deepEqual([task.prompt, task.agent, task.target, task.kind, task.tools, task.maxRunMs], ["p", "retry", "thread", "task", ["read"], 5000]);
  assert.equal(tasks.getTask(source.id).status, "completed");
  const again = await (await call(task.id, { action: "retry" })).json();
  assert.equal(again.error, "Task is not finished");
  const third = await (await call(finished({ attempt: 2 }, "failed").id, { action: "retry" })).json();
  assert.equal(third.task.attempt, 3);
});
test("retry of a queued or running task answers 409", async () => {
  const queued = tasks.createTask({ profile: "retry", cwd: "/h", title: "t", prompt: "p", origin: "ui" });
  assert.equal((await call(queued.id, { action: "retry" })).status, 409);
  tasks.claimTask(queued.id);
  assert.equal((await call(queued.id, { action: "retry" })).status, 409);
});
test("a trigger task is retried while the pin holds, refused once the profile drifted or the trigger is gone", async () => {
  const trigger = {
    id: "00000000-0000-4000-8000-000000000002", name: "t", profile: "retry", enabled: true, promptTemplate: "check", dedupWindowMs: 60_000, maxActiveTasks: 5,
    webhookSecretSha256: "a".repeat(64), pinnedProfile: { scope: "global", contentSha256: triggers.profilePinSha256(reg.resolveLongTermProfile("retry")) },
  };
  triggers.saveTrigger(trigger);
  const source = finished({ origin: "trigger", triggerId: trigger.id, pinnedProfileSha256: trigger.pinnedProfile.contentSha256, agent: "retry", target: "isolated", kind: "webhook" }, "failed");
  const ok = await call(source.id, { action: "retry" });
  assert.equal(ok.status, 201);
  const { task } = await ok.json();
  assert.equal(task.origin, "trigger");
  assert.equal(task.triggerId, trigger.id);
  assert.equal(task.pinnedProfileSha256, trigger.pinnedProfile.contentSha256);
  const [entry] = triggerLog.readTriggerLog(trigger.id);
  assert.deepEqual([entry.source, entry.verdict, entry.taskId, entry.reason], ["manual", "accepted", task.id, `retry of ${source.id.slice(0, 8)}`]);

  triggers.saveTrigger({ ...trigger, pinnedProfile: { scope: "global", contentSha256: "0".repeat(64) } });
  const drift = await call(source.id, { action: "retry" });
  assert.equal(drift.status, 409);
  assert.equal((await drift.json()).error, "profile drifted since this trigger was validated");

  triggers.deleteTrigger(trigger.id);
  const gone = await call(source.id, { action: "retry" });
  assert.equal(gone.status, 409);
  assert.equal((await gone.json()).error, "trigger removed");
});
test("a message still steers, both fields or neither is a 400", async () => {
  const source = finished({});
  const steer = await call(source.id, { message: "hi" });
  assert.equal(steer.status, 409);
  assert.equal((await steer.json()).error, "Task is not running a session");
  assert.equal((await call(source.id, { message: "hi", action: "retry" })).status, 400);
  assert.equal((await call(source.id, { action: "nope" })).status, 400);
  assert.equal((await call("00000000-0000-4000-8000-0000000000ff", { action: "retry" })).status, 404);
});
