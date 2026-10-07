import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-agentops-dryrun-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { POST: dryRun } = await jiti.import("./[id]/dry-run/route.ts");
const { POST: fire } = await jiti.import("./[id]/fire/route.ts");
const triggers = await jiti.import("@/lib/agent-ops/trigger-store.ts");
const tasks = await jiti.import("@/lib/agent-ops/task-store.ts");
const settings = await jiti.import("@/lib/agent-ops/settings.ts");
const reg = await jiti.import("@/lib/agents/registry.ts");

reg.createLongTermAgent({ name: "dry", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } });
const trigger = {
  id: "00000000-0000-4000-8000-000000000001", name: "t", profile: "dry", enabled: true, promptTemplate: "check", dedupWindowMs: 60_000, maxActiveTasks: 1,
  webhookSecretSha256: "a".repeat(64), pinnedProfile: { scope: "global", contentSha256: triggers.profilePinSha256(reg.resolveLongTermProfile("dry")) },
};
triggers.saveTrigger(trigger);
settings.updateAgentOpsSettings({ minFreeMb: 100_000_000 }); // no free-memory headroom: the kick after a fire starts no run

const call = (handler, id, body) => handler(new Request("http://localhost/x", { method: "POST", headers: { host: "localhost" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id }) });

test("dry-run returns the fenced prompt and writes nothing", async () => {
  const before = readdirSync(triggers.triggersDir()).sort();
  const res = await call(dryRun, trigger.id, { payload: { text: "disk full" } });
  assert.equal(res.status, 200);
  const { plan } = await res.json();
  assert.equal(plan.verdict, "accepted"); assert.equal(plan.tokenFree, true); assert.equal(plan.target, "isolated"); assert.equal(plan.pinStatus, "ok");
  assert.match(plan.prompt, /<untrusted_payload>\ndisk full/); assert.ok(plan.tools.includes("read"));
  assert.deepEqual(readdirSync(triggers.triggersDir()).sort(), before);
  assert.equal(tasks.listTasks().length, 0);
});
test("dry-run: empty body allowed, bad JSON 400, unknown trigger 404", async () => {
  assert.equal((await call(dryRun, trigger.id)).status, 200);
  assert.equal((await call(dryRun, trigger.id, "{ nope")).status, 400);
  assert.equal((await call(dryRun, "00000000-0000-4000-8000-0000000000ff", {})).status, 404);
});
test("fire answers 202 with a task, then 409 at the cap", async () => {
  const res = await call(fire, trigger.id, { payload: { text: "go" } });
  assert.equal(res.status, 202);
  assert.equal(tasks.getTask((await res.json()).taskId).fireReason.source, "manual");
  const refused = await call(fire, trigger.id);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).reason, "too many active tasks for this trigger");
  assert.equal((await call(fire, "00000000-0000-4000-8000-0000000000ff")).status, 404);
});
