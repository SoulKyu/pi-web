import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agents-registry-")); // before the import
const reg = await (await import("jiti")).createJiti(import.meta.url).import("./registry.ts");
const dir = process.env.PI_CODING_AGENT_DIR;
const input = { name: "leandro", role: "You are Leandro, an SRE.", model: "zai/glm-5.3", thinking: "medium", toolsPreset: "standard", avatar: { emoji: "🛠", color: "#e07a5f" } };

test("create writes profile, space state and home; list and get read them back", () => {
  const agent = reg.createLongTermAgent(input);
  assert.equal(agent.home, join(dir, "agents-home", "leandro"));
  assert.equal((statSync(agent.home).mode & 0o777), 0o700);
  assert.ok(existsSync(join(dir, "agents", "leandro.md")));
  assert.ok(existsSync(join(dir, "agent-spaces", "leandro.json")));
  const listed = reg.listLongTermAgents();
  assert.deepEqual(listed.map((a) => a.name), ["leandro"]);
  const got = reg.getLongTermAgent("leandro");
  assert.equal(got.role, input.role);
  assert.equal(got.model, "zai/glm-5.3");
  assert.equal(got.thinking, "medium");
  assert.equal(got.toolsPreset, "standard");
  assert.deepEqual(got.avatar, input.avatar);
  assert.equal(got.threadSessionId, undefined);
  assert.equal(reg.getLongTermAgent("nobody"), null);
});

test("ordinary global profiles are not agents, and a name taken by any profile is refused (Review Focus 1)", () => {
  writeFileSync(join(dir, "agents", "helper.md"), "---\ndescription: helper\n---\nhelp\n");
  assert.deepEqual(reg.listLongTermAgents().map((a) => a.name), ["leandro"]);
  assert.throws(() => reg.createLongTermAgent({ ...input, name: "helper" }), (e) => e.code === "conflict");
  assert.throws(() => reg.createLongTermAgent({ ...input, name: "Leandro" }), (e) => e.code === "conflict"); // case-insensitive, like resolveSubagentProfile
  assert.throws(() => reg.createLongTermAgent({ ...input, name: "plan" }), (e) => e.code === "conflict");   // a built-in
  assert.throws(() => reg.createLongTermAgent({ ...input, name: "../x" }), (e) => e.code === "invalid");
});

test("presets map both ways", () => {
  assert.deepEqual([...reg.TOOLS_BY_PRESET["read-only"]], ["read", "grep", "find", "ls"]);
  assert.equal(reg.presetFromTools(["write", "edit", "bash", "read"]), "standard");
  assert.equal(reg.presetFromTools(["bash", "read", "edit", "write", "grep", "find", "ls"]), "full");
  assert.equal(reg.presetFromTools(["read"]), "standard"); // unknown mix: the middle preset
});

test("validateCreateInput refuses bad names, colors, presets and thinking; accepts a full body", () => {
  assert.equal(reg.validateCreateInput({ ...input, avatar: { emoji: "x", color: "red" } }).ok, false);
  assert.equal(reg.validateCreateInput({ ...input, toolsPreset: "all" }).ok, false);
  assert.equal(reg.validateCreateInput({ ...input, thinking: "ultra" }).ok, false);
  assert.equal(reg.validateCreateInput({ ...input, role: "   " }).ok, false);
  assert.equal(reg.validateCreateInput({ ...input, avatar: { emoji: "", color: "#e07a5f" } }).ok, false);
  const ok = reg.validateCreateInput(input);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.input, input);
  assert.equal(reg.validateUpdateInput({ unknown: 1 }).ok, false);
  assert.deepEqual(reg.validateUpdateInput({ toolsPreset: "full" }).input, { toolsPreset: "full" });
});

test("update changes profile fields and avatar; thread and read markers persist", () => {
  const updated = reg.updateLongTermAgent("leandro", { role: "New role", toolsPreset: "full", avatar: { emoji: "🤖", color: "#3d9970" }, model: undefined });
  assert.equal(updated.role, "New role");
  assert.equal(updated.toolsPreset, "full");
  assert.equal(updated.avatar.emoji, "🤖");
  reg.setThreadSessionId("leandro", "11111111-1111-4111-8111-111111111111");
  reg.setLastReadEntryId("leandro", "abcd1234");
  const got = reg.getLongTermAgent("leandro");
  assert.equal(got.threadSessionId, "11111111-1111-4111-8111-111111111111");
  assert.equal(got.lastReadEntryId, "abcd1234");
  assert.equal(got.role, "New role"); // the space write did not touch the profile
  assert.throws(() => reg.updateLongTermAgent("nobody", { role: "x" }), (e) => e.code === "not_found");
});

test("delete moves home and thread to the trash and removes profile and space", () => {
  const thread = join(dir, "thread.jsonl");
  writeFileSync(thread, "{}\n");
  writeFileSync(join(reg.agentHome("leandro"), "runbook.md"), "# runbook\n");
  const trash = reg.deleteLongTermAgent("leandro", thread);
  assert.ok(trash.startsWith(join(dir, "agent-spaces", ".trash", "leandro-")));
  assert.ok(existsSync(join(trash, "home", "runbook.md")));
  assert.ok(existsSync(join(trash, "thread.jsonl")));
  assert.equal(existsSync(thread), false);
  assert.equal(existsSync(join(dir, "agents", "leandro.md")), false);
  assert.equal(existsSync(join(dir, "agent-spaces", "leandro.json")), false);
  assert.deepEqual(reg.listLongTermAgents(), []);
  assert.equal(readdirSync(join(dir, "agent-spaces", ".trash")).length, 1);
});

test("isAgentHomePath covers homes and their contents only", () => {
  assert.equal(reg.isAgentHomePath(join(dir, "agents-home", "x", "notes")), true);
  assert.equal(reg.isAgentHomePath(join(dir, "agents-home")), true);
  assert.equal(reg.isAgentHomePath(join(dir, "agents-homes")), false);
  assert.equal(reg.isAgentHomePath("/tmp/elsewhere"), false);
});
