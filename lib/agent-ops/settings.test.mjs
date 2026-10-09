import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agentops-settings-"));
const s = await (await import("jiti")).createJiti(import.meta.url).import("./settings.ts");
const file = join(mkdtempSync(join(tmpdir(), "s-")), "settings.json");

test("defaults on absence and junk; patches validate and persist", () => {
  assert.deepEqual(s.readAgentOpsSettings(file), s.DEFAULT_AGENT_OPS_SETTINGS);
  writeFileSync(file, "{ nope");
  assert.deepEqual(s.readAgentOpsSettings(file), s.DEFAULT_AGENT_OPS_SETTINGS);
  const next = s.updateAgentOpsSettings({ maxAutomaticRuns: 1, quietHours: { from: "23:00", to: "07:00" }, pausedAgents: ["Julien"] }, file);
  assert.equal(next.maxAutomaticRuns, 1);
  assert.deepEqual(s.readAgentOpsSettings(file), next);
  assert.ok(s.isPausedFor(next, "Julien")); assert.ok(!s.isPausedFor(next, "Martin"));
  assert.ok(s.isPausedFor(s.updateAgentOpsSettings({ paused: true }, file), "Martin"));
});
test("a null or undefined quietHours clears the key", () => {
  s.updateAgentOpsSettings({ quietHours: { from: "23:00", to: "07:00" } }, file);
  assert.equal("quietHours" in s.updateAgentOpsSettings({ quietHours: null }, file), false);
  assert.equal("quietHours" in s.readAgentOpsSettings(file), false);
});
test("validation refuses bad values", () => {
  for (const bad of [{ maxAutomaticRuns: 0 }, { maxAutomaticRuns: 9 }, { minFreeMb: -1 }, { quietHours: { from: "25:00", to: "07:00" } }, { pausedAgents: ["../x"] }, { nope: 1 }]) {
    assert.equal(s.validateAgentOpsSettingsPatch(bad).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(s.validateAgentOpsSettingsPatch({ quietHours: null }), { ok: true, patch: { quietHours: undefined } });
});
test("a bad or unknown key never resets the pause; valid keys survive", () => {
  writeFileSync(file, JSON.stringify({ paused: true, nope: 1, maxAutomaticRuns: 99, pausedAgents: ["a"] }));
  const read = s.readAgentOpsSettings(file);
  assert.equal(read.paused, true);
  assert.deepEqual(read.pausedAgents, ["a"]);
  assert.equal(read.maxAutomaticRuns, s.DEFAULT_AGENT_OPS_SETTINGS.maxAutomaticRuns);
});
test("maxPendingReminders: default 5, an integer from 1 to 50", () => {
  assert.equal(s.DEFAULT_AGENT_OPS_SETTINGS.maxPendingReminders, 5);
  assert.deepEqual(s.validateAgentOpsSettingsPatch({ maxPendingReminders: 12 }), { ok: true, patch: { maxPendingReminders: 12 } });
  for (const bad of [0, 51, 2.5, "3", null]) assert.equal(s.validateAgentOpsSettingsPatch({ maxPendingReminders: bad }).ok, false, String(bad));
});
