import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-triggers-"));
const {
  buildTriggerConfig, checkActiveTriggerTools, deleteTrigger, getTrigger, listTriggers, profilePinSha256,
  saveTrigger, triggerRunPin, triggersDir, validateTriggerFields, validateTriggerProfile,
} = await (await import("jiti")).createJiti(import.meta.url).import("./trigger-store.ts");

test("checkActiveTriggerTools refuses subagent/bash, accepts read + memory_search", () => {
  assert.match(checkActiveTriggerTools(["read", "subagent"]), /outside the allowlist: subagent/);
  assert.match(checkActiveTriggerTools(["bash"]), /outside the allowlist: bash/);
  assert.equal(checkActiveTriggerTools(["read", "memory_search"]), null);
});

test("profilePinSha256 hashes the file bytes for file-backed profiles", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "agentops-pin-")), "p.md");
  writeFileSync(filePath, "one");
  const first = profilePinSha256({ filePath });
  assert.equal(profilePinSha256({ filePath }), first);
  writeFileSync(filePath, "two");
  assert.notEqual(profilePinSha256({ filePath }), first);
});

test("profilePinSha256 hashes the snapshot of built-in profiles", () => {
  const builtIn = { systemPrompt: "a", tools: ["read"], loadSkills: false, loadExtensions: false };
  assert.equal(profilePinSha256({ ...builtIn }), profilePinSha256({ ...builtIn }));
  assert.notEqual(profilePinSha256({ ...builtIn, systemPrompt: "b" }), profilePinSha256(builtIn));
});

const builtIn = { name: "reader", scope: "builtin", systemPrompt: "a", tools: ["read"], loadSkills: false, loadExtensions: false };
const baseInput = { name: "nightly", profile: "reader", cwd: "/work", promptTemplate: "check {{x}}" };
const resolveBuiltIn = (name) => (name === "reader" ? builtIn : null);

test("validateTriggerProfile refuses bash, outside extension tools and loadExtensions without extensionTools", () => {
  assert.match(validateTriggerProfile({ ...builtIn, tools: ["read", "bash"] }), /found: bash/);
  assert.match(validateTriggerProfile({ ...builtIn, extensionTools: ["mcp__x__run"] }), /found: mcp__x__run/);
  assert.match(validateTriggerProfile({ ...builtIn, loadExtensions: true }), /explicit extensionTools/);
  assert.match(validateTriggerProfile({ ...builtIn, loadExtensions: true, extensionTools: [] }), /explicit extensionTools/);
});

test("validateTriggerProfile accepts read + memory_search", () => {
  assert.equal(validateTriggerProfile({ ...builtIn, tools: ["read"], extensionTools: ["memory_search"], loadExtensions: true }), null);
});

test("buildTriggerConfig applies defaults, a new UUID and the profile pin", () => {
  const result = buildTriggerConfig(baseInput, resolveBuiltIn);
  assert.equal(result.ok, true);
  const { trigger } = result;
  assert.match(trigger.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(trigger.enabled, true);
  assert.equal(trigger.dedupWindowMs, 15 * 60_000);
  assert.equal(trigger.maxActiveTasks, 1);
  assert.equal(trigger.everyMinutes, undefined);
  assert.deepEqual(trigger.pinnedProfile, { scope: "builtin", contentSha256: profilePinSha256(builtIn) });
  assert.notEqual(buildTriggerConfig(baseInput, resolveBuiltIn).trigger.id, trigger.id);
});

test("buildTriggerConfig pins filePath and file hash of a file-backed profile", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "agentops-pin-")), "p.md");
  writeFileSync(filePath, "profile bytes");
  const result = buildTriggerConfig(baseInput, () => ({ ...builtIn, scope: "global", filePath }));
  assert.deepEqual(result.trigger.pinnedProfile, { scope: "global", filePath, contentSha256: profilePinSha256({ filePath }) });
});

test("buildTriggerConfig keeps explicit values", () => {
  const { trigger } = buildTriggerConfig({ ...baseInput, everyMinutes: 5, dedupWindowMs: 1000, maxActiveTasks: 3, enabled: false }, resolveBuiltIn);
  assert.equal(trigger.everyMinutes, 5);
  assert.equal(trigger.dedupWindowMs, 1000);
  assert.equal(trigger.maxActiveTasks, 3);
  assert.equal(trigger.enabled, false);
  assert.equal(trigger.webhookSecret, undefined);
});

test("buildTriggerConfig refuses each invalid input", () => {
  const refused = (patch, pattern, resolve = resolveBuiltIn) => {
    const result = buildTriggerConfig({ ...baseInput, ...patch }, resolve);
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
  };
  refused({ profile: "ghost" }, /profile.*not found/i);
  refused({}, /found: bash/, () => ({ ...builtIn, tools: ["bash"] }));
  refused({ dedupWindowMs: 0 }, /dedupWindowMs/);
  refused({ dedupWindowMs: -5 }, /dedupWindowMs/);
  refused({ dedupWindowMs: Number.NaN }, /dedupWindowMs/);
  refused({ maxActiveTasks: 0 }, /maxActiveTasks/);
  refused({ maxActiveTasks: 1.5 }, /maxActiveTasks/);
  refused({ everyMinutes: 0 }, /everyMinutes/);
  refused({ everyMinutes: 2.5 }, /everyMinutes/);
  refused({ name: "  " }, /name/);
  refused({ promptTemplate: "" }, /promptTemplate/);
  refused({ cwd: "" }, /cwd/);
  refused({ profile: "" }, /profile is required/);
  refused({ profile: 7 }, /profile is required/);
  refused({ enabled: "false" }, /enabled must be a boolean/);
  refused({ enabled: null }, /enabled must be a boolean/);
  refused({ enabled: 0 }, /enabled must be a boolean/);
  refused({ webhookSecret: "chosen" }, /generated by the server/);
  refused({ webhookSecret: "" }, /generated by the server/);
  refused({ webhookSecret: null }, /generated by the server/);
});

test("buildTriggerConfig refuses instead of throwing when the profile file vanished before the pin", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "agentops-pin-")), "gone.md");
  const result = buildTriggerConfig(baseInput, () => ({ ...builtIn, scope: "global", filePath }));
  assert.equal(result.ok, false);
  assert.match(result.error, /unreadable/);
});

test("validateTriggerFields needs no profile lookup", () => {
  assert.equal(validateTriggerFields(baseInput), null);
  assert.match(validateTriggerFields({ ...baseInput, maxActiveTasks: 0 }), /maxActiveTasks/);
});

test("triggerRunPin returns the pin of trigger tasks, throws without one, ignores other origins", () => {
  assert.equal(triggerRunPin({ origin: "trigger", pinnedProfileSha256: "abc" }), "abc");
  assert.throws(() => triggerRunPin({ origin: "trigger" }), /trigger task without a profile pin/);
  assert.equal(triggerRunPin({ origin: "ui", pinnedProfileSha256: "abc" }), undefined);
  assert.equal(triggerRunPin({ origin: "ui" }), undefined);
});

test("trigger CRUD: save, get, list (uuid json only), delete", () => {
  assert.deepEqual(listTriggers(), []);
  const { trigger } = buildTriggerConfig(baseInput, resolveBuiltIn);
  saveTrigger(trigger);
  assert.equal(triggersDir(), join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "triggers"));
  assert.equal(statSync(join(triggersDir(), `${trigger.id}.json`)).mode & 0o777, 0o600);
  assert.deepEqual(getTrigger(trigger.id), trigger);
  writeFileSync(join(triggersDir(), `${trigger.id}.token`), "fire-token");
  writeFileSync(join(triggersDir(), "not-a-uuid.json"), "{}");
  assert.deepEqual(listTriggers().map((t) => t.id), [trigger.id]);
  assert.equal(deleteTrigger(trigger.id), true);
  assert.equal(getTrigger(trigger.id), null);
  assert.equal(existsSync(join(triggersDir(), `${trigger.id}.json`)), false);
  assert.equal(deleteTrigger(trigger.id), false);
});

test("trigger CRUD rejects non-uuid ids", () => {
  assert.equal(getTrigger("../etc/passwd"), null);
  assert.equal(getTrigger("not-a-uuid"), null);
  assert.equal(deleteTrigger("../x"), false);
  assert.throws(() => saveTrigger({ id: "../x" }), /invalid trigger id/);
});
