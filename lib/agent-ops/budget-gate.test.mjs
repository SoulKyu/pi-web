import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-budget-gate-"));
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { failOverBudgetTriggerTasks, overBudgetTriggerTasks, triggerBudgetRefusal } = await jiti.import("./budget-gate.ts");

const REASON = "daily token budget reached";
const mk = (id, over = {}) => ({ id, profile: "ada", agent: "ada", origin: "trigger", triggerId: "g1", status: "queued", fireReason: { source: "webhook", bucket: 7, payloadHash: "abc" }, ...over });
const over = (agents) => (agent) => (agents.includes(agent) ? REASON : null);

test("triggerBudgetRefusal gates trigger tasks only, by agent then profile", () => {
  assert.equal(triggerBudgetRefusal(mk("a"), over(["ada"])), REASON);
  assert.equal(triggerBudgetRefusal(mk("a", { agent: undefined }), over(["ada"])), REASON);
  assert.equal(triggerBudgetRefusal(mk("a", { origin: "ui" }), over(["ada"])), null);
  assert.equal(triggerBudgetRefusal(mk("a"), over([])), null);
});

test("overBudgetTriggerTasks asks once per agent and skips ui and non-queued tasks", () => {
  const asked = [];
  const refusalFor = (agent) => { asked.push(agent); return agent === "ada" ? REASON : null; };
  const tasks = [mk("1"), mk("2"), mk("3", { origin: "ui" }), mk("4", { status: "running" }), mk("5", { agent: "bob", profile: "bob" })];
  assert.deepEqual(overBudgetTriggerTasks(tasks, refusalFor).map((o) => o.task.id), ["1", "2"]);
  assert.deepEqual(asked, ["ada", "bob"]);
});

test("failOverBudgetTriggerTasks fails each over-budget queued trigger task once and journals it", () => {
  const store = [mk("1"), mk("2", { fireReason: { source: "schedule", bucket: 3 } }), mk("3", { origin: "ui", triggerId: undefined }), mk("4", { agent: "bob", profile: "bob" })];
  const failed = [];
  const logged = [];
  const count = failOverBudgetTriggerTasks({
    list: () => store, refusalFor: over(["ada"]),
    fail: (id, patch) => { failed.push({ id, patch }); },
    log: (triggerId, entry) => { logged.push({ triggerId, entry }); },
  });
  assert.equal(count, 2);
  assert.deepEqual(failed.map((f) => [f.id, f.patch.status, f.patch.error]), [["1", "failed", REASON], ["2", "failed", REASON]]);
  assert.ok(failed.every((f) => typeof f.patch.completedAt === "string"));
  assert.deepEqual(logged.map((l) => [l.triggerId, l.entry.source, l.entry.verdict, l.entry.reason]), [["g1", "webhook", "refused", REASON], ["g1", "schedule", "refused", REASON]]);
  assert.equal(logged[0].entry.payloadHash, "abc");
});

test("a task a cancel already finished is skipped without a journal line", () => {
  const logged = [];
  const count = failOverBudgetTriggerTasks({ list: () => [mk("1")], refusalFor: over(["ada"]), fail: () => { throw new Error("terminal"); }, log: (...a) => logged.push(a) });
  assert.equal(count, 0);
  assert.equal(logged.length, 0);
});

test("a budget-free kick fails nothing", () => {
  assert.equal(failOverBudgetTriggerTasks({ list: () => [mk("1")], refusalFor: () => null, fail: () => assert.fail("no write"), log: () => assert.fail("no log") }), 0);
});
