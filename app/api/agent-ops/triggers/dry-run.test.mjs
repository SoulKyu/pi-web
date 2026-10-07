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

let seq = 0;
const scheduleTrigger = (over) => {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "1")}`;
  const made = { id, name: "s", profile: "dry", enabled: true, promptTemplate: "raw template", dedupWindowMs: 60_000, maxActiveTasks: 5, pinnedProfile: trigger.pinnedProfile, ...over };
  triggers.saveTrigger(made);
  return made;
};
const planOf = async (t) => (await (await call(dryRun, t.id, {})).json()).plan;

test("dry-run: paused refuses with agent paused; a disabled trigger keeps its own reason", async () => {
  settings.updateAgentOpsSettings({ paused: true });
  try {
    assert.equal((await planOf(scheduleTrigger({ webhookSecretSha256: undefined }))).reason, "agent paused");
    assert.equal((await planOf(scheduleTrigger({ enabled: false }))).reason, "trigger disabled");
  } finally { settings.updateAgentOpsSettings({ paused: false }); }
});
test("dry-run: a schedule trigger shows the raw template and its tool subset", async () => {
  const plan = await planOf(scheduleTrigger({ runTarget: "isolated", tools: ["read"] }));
  assert.equal(plan.prompt, "raw template"); assert.equal(plan.target, "isolated"); assert.deepEqual(plan.tools, ["read"]);
});
test("dry-run: inside quiet hours the plan carries deferredUntil unless the trigger is critical", async () => {
  settings.updateAgentOpsSettings({ quietHours: { from: "00:00", to: "23:59" } });
  try {
    const plan = await planOf(scheduleTrigger({}));
    assert.ok(Date.parse(plan.deferredUntil) > Date.now());
    assert.equal((await planOf(scheduleTrigger({ critical: true }))).deferredUntil, undefined);
  } finally { settings.updateAgentOpsSettings({ quietHours: null }); }
});

test("dry-run: a trigger at its daily cap is refused like the real hook", async () => {
  const capped = { ...trigger, id: "00000000-0000-4000-8000-000000000009", maxActiveTasks: 9, maxRunsPerDay: 1 };
  triggers.saveTrigger(capped);
  tasks.createTask({ agent: "dry", profile: "dry", cwd: "/tmp", origin: "trigger", triggerId: capped.id, target: "isolated", kind: "webhook", title: "x", prompt: "p", pinnedProfileSha256: capped.pinnedProfile.contentSha256 });
  const { plan } = await (await call(dryRun, capped.id, { payload: { text: "a" } })).json();
  assert.equal(plan.verdict, "refused");
  assert.equal(plan.reason, "daily run cap reached");
});
