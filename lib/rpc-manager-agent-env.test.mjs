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

const settings = { getShellCommandPrefix: () => undefined, getShellPath: () => undefined };

test("every agent-profile session gets the sanitized bash and the read-only MCP policy", () => {
  const names = agentProfileExtensionFactories({ cwd: "/h", settings, trustedThread: false }).map((e) => e.name);
  assert.ok(names.includes("pi-web-project-command-environment"));
  assert.ok(names.includes(READ_ONLY_MCP_POLICY_EXTENSION_NAME));
  assert.ok(!names.includes(AGENT_NOTIFY_EXTENSION_NAME));
});

test("a trusted thread adds agent_notify; the exact system prompt extension comes first when given", () => {
  const exact = { name: "exact", hidden: true, factory: () => {} };
  const names = agentProfileExtensionFactories({ cwd: "/h", settings, trustedThread: true, agentName: "a", exactSystemPrompt: exact }).map((e) => e.name);
  assert.equal(names[0], "exact");
  assert.ok(names.includes(AGENT_NOTIFY_EXTENSION_NAME));
});
