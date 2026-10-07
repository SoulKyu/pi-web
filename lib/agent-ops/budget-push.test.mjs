import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-budget-push-"));
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { pushBudgetReachedOnce } = await jiti.import("./budget-push.ts");
const runs = await jiti.import("./run-registry.ts");
const triggers = await jiti.import("./trigger-store.ts");
const sched = await jiti.import("./scheduler.ts");
const reg = await jiti.import("../agents/registry.ts");

const create = (name, extra) => reg.createLongTermAgent({ name, role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" }, ...extra });
const spend = (agent, input, cost = 0) => runs.appendRunRecord({ ts: new Date().toISOString(), agent, origin: "trigger", status: "completed", usage: { input, output: 0, cacheRead: 0, cacheWrite: 0, cost }, billing: "api" });
const counting = () => { const pushes = []; return { pushes, notify: async (payloadFor) => void pushes.push(payloadFor("en")) }; };
const date = (now) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

test("no budget, or under it: no push and no token", async () => {
  create("free", {});
  create("under", { budgetTokensPerDay: 100 });
  spend("under", 5);
  const { pushes, notify } = counting();
  await pushBudgetReachedOnce("free", { notify });
  await pushBudgetReachedOnce("under", { notify });
  await pushBudgetReachedOnce("ghost", { notify });
  assert.equal(pushes.length, 0);
  assert.equal(existsSync(join(triggers.triggersDir(), `budget.under.${date(new Date())}`)), false);
});

test("reaching the budget pushes once per agent per day, with url and tag", async () => {
  create("tok", { budgetTokensPerDay: 10 });
  create("usd", { budgetUsdPerDay: 1 });
  spend("tok", 11);
  spend("usd", 1, 1.5);
  const { pushes, notify } = counting();
  const today = date(new Date());
  await pushBudgetReachedOnce("tok", { notify });
  await pushBudgetReachedOnce("tok", { notify }); // a second run the same day
  await pushBudgetReachedOnce("usd", { notify });
  assert.equal(pushes.length, 2);
  assert.equal(pushes[0].url, "/?agent=tok");
  assert.equal(pushes[0].tag, `pi-agent-budget:tok:${today}`);
  assert.match(pushes[0].body, /tok: daily budget reached \(tokens\)/);
  assert.match(pushes[1].body, /usd: daily budget reached \(cost\)/);
  assert.equal(existsSync(join(triggers.triggersDir(), `budget.tok.${today}`)), true);
});

test("budget tokens are purged after 48 h", async () => {
  const { utimesSync, writeFileSync } = await import("node:fs");
  const token = join(triggers.triggersDir(), "budget.old.2020-01-01");
  writeFileSync(token, "");
  const old = (Date.now() - 3 * 24 * 3_600_000) / 1000;
  utimesSync(token, old, old);
  sched.purgeStaleFireTokens();
  assert.equal(existsSync(token), false);
});
