import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agents-registry-")); // before the import
process.env.HOME = mkdtempSync(join(tmpdir(), "pi-web-agents-home-")); // the MCP list reads the user's global config
mkdirSync(join(process.env.HOME, ".config/mcp"), { recursive: true });
writeFileSync(join(process.env.HOME, ".config/mcp/mcp.json"), JSON.stringify({ mcpServers: { github: { command: "x" }, slack: { url: "https://x" } } }));
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
  assert.equal(reg.validateCreateInput({ ...input, name: "a..b" }).ok, false); // pi-mem0 rejects any scope containing ".."
  const ok = reg.validateCreateInput(input);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.input, input);
  assert.equal(reg.validateUpdateInput({ unknown: 1 }).ok, false);
  assert.equal(reg.validateUpdateInput({ name: "other" }).ok, false);
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

test("archiveThread moves the thread file to the trash and clears both ids; null without a file", () => {
  const thread = join(dir, "old-thread.jsonl");
  writeFileSync(thread, "{}\n");
  const trash = reg.archiveThread("leandro", thread);
  assert.ok(trash.startsWith(join(dir, "agent-spaces", ".trash", "leandro-")));
  assert.ok(existsSync(join(trash, "thread.jsonl")));
  assert.equal(existsSync(thread), false);
  assert.equal((statSync(trash).mode & 0o777), 0o700);
  const got = reg.getLongTermAgent("leandro");
  assert.equal(got.threadSessionId, undefined);
  assert.equal(got.lastReadEntryId, undefined);
  assert.ok(existsSync(reg.agentHome("leandro")));
  reg.setThreadSessionId("leandro", "22222222-2222-4222-8222-222222222222");
  assert.equal(reg.archiveThread("leandro", join(dir, "missing.jsonl")), null);
  assert.equal(reg.getLongTermAgent("leandro").threadSessionId, undefined);
  assert.throws(() => reg.archiveThread("nobody", undefined), (e) => e.code === "not_found");
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
  assert.equal(readdirSync(join(dir, "agent-spaces", ".trash")).length, 2); // the archive above, then this delete
});

test("isAgentHomePath covers homes and their contents only", () => {
  assert.equal(reg.isAgentHomePath(join(dir, "agents-home", "x", "notes")), true);
  assert.equal(reg.isAgentHomePath(join(dir, "agents-home")), true);
  assert.equal(reg.isAgentHomePath(join(dir, "agents-homes")), false);
  assert.equal(reg.isAgentHomePath("/tmp/elsewhere"), false);
});

test("a failed profile write rolls back home and space so the name can be retried", () => {
  const agentsDir = join(dir, "agents");
  const backup = join(dir, "agents-backup");
  renameSync(agentsDir, backup);
  writeFileSync(agentsDir, "not a directory"); // saveSubagentProfile's mkdir fails with ENOTDIR
  assert.throws(() => reg.createLongTermAgent({ ...input, name: "retry" }));
  assert.equal(existsSync(reg.agentHome("retry")), false);
  assert.equal(existsSync(join(dir, "agent-spaces", "retry.json")), false);
  rmSync(agentsDir);
  renameSync(backup, agentsDir);
  assert.equal(reg.createLongTermAgent({ ...input, name: "retry" }).name, "retry");
});

test("resolveLongTermProfile finds a long-term agent by exact name only", () => {
  writeFileSync(join(dir, "agents", "plain.md"), "---\ndescription: plain\n---\nplain\n");
  reg.createLongTermAgent({ ...input, name: "resolver" });
  assert.equal(reg.resolveLongTermProfile("resolver").longTerm, true);
  assert.equal(reg.resolveLongTermProfile("Resolver"), undefined);
  assert.equal(reg.resolveLongTermProfile("plain"), undefined);
  assert.equal(reg.resolveLongTermProfile("nobody"), undefined);
});

test("names longer than 64 characters are refused", () => {
  const long = "a".repeat(65);
  assert.deepEqual(reg.validateCreateInput({ ...input, name: long }), { ok: false, error: "name must be at most 64 characters" });
  assert.equal(reg.validateCreateInput({ ...input, name: "a".repeat(64) }).ok, true);
  assert.throws(() => reg.createLongTermAgent({ ...input, name: long }), (e) => e.code === "invalid");
});

test("a failed MCP sync leaves no profile, space or home behind", { skip: process.getuid?.() === 0 }, () => {
  const previous = process.umask(0o277); // the new home gets mode 500, so the sync's mkdir of .pi fails with EACCES
  try {
    assert.throws(() => reg.createLongTermAgent({ ...input, name: "syncfail" }), /EACCES/);
  } finally {
    process.umask(previous);
  }
  assert.equal(existsSync(join(dir, "agents", "syncfail.md")), false);
  assert.equal(existsSync(join(dir, "agent-spaces", "syncfail.json")), false);
  assert.equal(existsSync(reg.agentHome("syncfail")), false);
});

test("mcpServers: stored in the frontmatter, defaults to none, replaced by update, synced into the home", () => {
  const plain = reg.createLongTermAgent({ ...input, name: "nomcp" });
  assert.deepEqual(plain.mcpServers, []);
  assert.doesNotMatch(readFileSync(join(dir, "agents", "nomcp.md"), "utf8"), /mcp_servers/);
  const overrides = (agent) => JSON.parse(readFileSync(join(agent.home, ".pi", "mcp-adapter.json"), "utf8"));
  assert.deepEqual(overrides(plain), { mcpServers: { github: { disabled: true }, slack: { disabled: true } } });
  const withMcp = reg.createLongTermAgent({ ...input, name: "withmcp", mcpServers: ["github"] });
  assert.deepEqual(reg.getLongTermAgent("withmcp").mcpServers, ["github"]);
  assert.match(readFileSync(join(dir, "agents", "withmcp.md"), "utf8"), /^mcp_servers:\n {2}- github$/m);
  assert.deepEqual(overrides(withMcp), { mcpServers: { slack: { disabled: true } } });
  const updated = reg.updateLongTermAgent("withmcp", { mcpServers: ["slack"] });
  assert.deepEqual(updated.mcpServers, ["slack"]);
  assert.deepEqual(overrides(updated), { mcpServers: { github: { disabled: true } } });
  assert.deepEqual(reg.updateLongTermAgent("withmcp", { role: "r2" }).mcpServers, ["slack"]); // untouched without the key
  assert.deepEqual(reg.updateLongTermAgent("withmcp", { mcpServers: [] }).mcpServers, []);
});

test("mcpServers validation: array of at most 100 server names, deduped; the name mcp-servers is reserved", () => {
  const bad = (value) => assert.deepEqual(reg.validateCreateInput({ ...input, mcpServers: value }), { ok: false, error: "mcpServers must be a list of server names" });
  bad("github");
  bad([1]);
  bad(["bad name"]);
  bad(["-x"]);
  bad(["a".repeat(129)]);
  bad(Array.from({ length: 101 }, (_, i) => `s${i}`));
  assert.equal(reg.validateCreateInput({ ...input, mcpServers: Array.from({ length: 100 }, (_, i) => `s${i}`) }).ok, true);
  assert.deepEqual(reg.validateCreateInput({ ...input, mcpServers: ["a", "a", "b.c-d_e"] }).input.mcpServers, ["a", "b.c-d_e"]);
  assert.deepEqual(reg.validateUpdateInput({ mcpServers: ["a"] }).input, { mcpServers: ["a"] });
  assert.equal(reg.validateUpdateInput({ mcpServers: null }).ok, false);
  assert.equal(reg.validateCreateInput({ ...input, name: "mcp-servers" }).ok, false);
});

test("roadmap profile keys round-trip through create, update and a save of another field (Review Focus 4)", () => {
  const input = { name: "keys", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" },
    memoryCapture: "off", memoryHint: "keep procedures only", memoryRecallLimit: 3, memoryRecallThreshold: 0.6, memorySave: "staged",
    acceptsDelegation: true, budgetTokensPerDay: 200000, budgetUsdPerDay: 2.5, commandDeny: ["terraform apply", "kubectl (delete|apply)"], webAllowHosts: ["news.ycombinator.com", "*.github.com"] };
  const agent = reg.createLongTermAgent(input);
  for (const key of ["memoryCapture", "memoryHint", "memoryRecallLimit", "memoryRecallThreshold", "memorySave", "acceptsDelegation", "budgetTokensPerDay", "budgetUsdPerDay", "commandDeny", "webAllowHosts"]) assert.deepEqual(agent[key], input[key], key);
  const updated = reg.updateLongTermAgent("keys", { role: "r2" });
  assert.deepEqual(updated.commandDeny, input.commandDeny);
  assert.equal(updated.memoryCapture, "off");
  assert.equal(reg.updateLongTermAgent("keys", { memoryCapture: null }).memoryCapture, undefined);
});

test("roadmap keys are validated", () => {
  const base = { role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } };
  for (const bad of [{ memoryCapture: "ask" }, { memoryHint: "x".repeat(501) }, { memoryRecallLimit: 21 }, { memoryRecallThreshold: 1.5 }, { memorySave: "maybe" }, { acceptsDelegation: "yes" }, { budgetTokensPerDay: -1 }, { budgetUsdPerDay: "2" }, { commandDeny: ["("] }, { webAllowHosts: ["http://x"] }]) {
    assert.equal(reg.validateCreateInput({ name: "bad", ...base, ...bad }).ok, false, JSON.stringify(bad));
  }
});

test("create writes MEMORY.md with its header (0600); another create leaves the first untouched; writeMemoryMd never overwrites", () => {
  const first = reg.createLongTermAgent({ ...input, name: "memo-a" });
  const file = join(first.home, "MEMORY.md");
  assert.equal(readFileSync(file, "utf8"), [
    "# memo-a memory", "",
    "One line per fact you want to keep across tasks. Keep it short; put details in notes/.",
    "Rule: read this file at the start of a task; update it when something durable changed.", "",
    "## Facts", "",
  ].join("\n"));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  writeFileSync(file, "# memo-a memory\n- uses zsh\n");
  reg.createLongTermAgent({ ...input, name: "memo-b" });
  assert.equal(readFileSync(file, "utf8"), "# memo-a memory\n- uses zsh\n");
  reg.writeMemoryMd(first.home, "memo-a");
  assert.equal(readFileSync(file, "utf8"), "# memo-a memory\n- uses zsh\n");
});

test("agentDetailExtras reports MEMORY.md's size, omits it when absent or a symlink", async () => {
  const { agentDetailExtras } = await (await import("jiti")).createJiti(import.meta.url).import("./agent-detail-extras.ts");
  const agent = reg.getLongTermAgent("memo-a");
  const size = statSync(join(agent.home, "MEMORY.md")).size;
  assert.deepEqual(agentDetailExtras(agent).memoryMd, { size });
  assert.ok(agentDetailExtras(agent).memorySnapshotPath.endsWith(join("agents", "memo-a.json")));
  rmSync(join(agent.home, "MEMORY.md"));
  assert.equal(agentDetailExtras(agent).memoryMd, undefined);
});
