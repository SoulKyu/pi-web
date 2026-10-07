import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agent-env-"));
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { agentProfileExtensionFactories } = await jiti.import("./agent-profile-extensions.ts");
const { READ_ONLY_MCP_POLICY_EXTENSION_NAME } = await jiti.import("./mcp-read-only-policy.ts");
const { AGENT_NOTIFY_EXTENSION_NAME } = await jiti.import("./agents/agent-notify.ts");
const { AGENT_APPROVE_EXTENSION_NAME } = await jiti.import("./agents/agent-approve.ts");

const { HOME_PATH_POLICY_EXTENSION_NAME } = await jiti.import("./agents/path-policy.ts");

const settings = { getShellCommandPrefix: () => undefined, getShellPath: () => undefined };

test("every agent-profile session gets the sanitized bash and the read-only MCP policy", () => {
  const names = agentProfileExtensionFactories({ cwd: "/h", settings, trustedThread: false }).map((e) => e.name);
  assert.ok(names.includes("pi-web-project-command-environment"));
  assert.ok(names.includes(READ_ONLY_MCP_POLICY_EXTENSION_NAME));
  assert.ok(!names.includes(AGENT_NOTIFY_EXTENSION_NAME));
  assert.ok(!names.includes(AGENT_APPROVE_EXTENSION_NAME));
});

test("a trusted thread adds agent_notify; the exact system prompt extension comes first when given", () => {
  const exact = { name: "exact", hidden: true, factory: () => {} };
  const names = agentProfileExtensionFactories({ cwd: "/h", settings, trustedThread: true, agentName: "a", exactSystemPrompt: exact }).map((e) => e.name);
  assert.equal(names[0], "exact");
  assert.ok(names.includes(AGENT_NOTIFY_EXTENSION_NAME));
  assert.ok(names.includes(AGENT_APPROVE_EXTENSION_NAME));
});

test("the home path policy is loaded only when homeOnly is given", () => {
  const base = { cwd: "/h", settings, trustedThread: false };
  assert.ok(agentProfileExtensionFactories({ ...base, homeOnly: "/h" }).map((e) => e.name).includes(HOME_PATH_POLICY_EXTENSION_NAME));
  assert.ok(!agentProfileExtensionFactories(base).map((e) => e.name).includes(HOME_PATH_POLICY_EXTENSION_NAME));
});

test("the read-only MCP policy of a profile session reads the profile snapshot", () => {
  const policy = agentProfileExtensionFactories({ cwd: "/h", settings, trustedThread: false }).find((e) => e.name === READ_ONLY_MCP_POLICY_EXTENSION_NAME);
  let hook;
  policy.factory({
    on: (_event, handler) => { hook = handler; },
    getAllTools: () => [{ name: "mcp__s__write", sourceInfo: { path: "/x" } }],
  });
  const snapshot = (tools) => [{ type: "custom", customType: "pi-web:agent-profile", data: { version: 1, profile: "a", resourceSnapshot: { version: 1, appendSystemPrompt: [], tools } } }];
  const call = (tools) => hook({ toolName: "mcp__s__write" }, { sessionManager: { getEntries: () => snapshot(tools) } });
  assert.equal(call(["read", "grep", "find", "ls"])?.block, true);
  assert.equal(call(["read", "bash"]), undefined);
});
