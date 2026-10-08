import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-perm-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { assessTrifecta, buildAgentPermissions, explainTrifecta } = await jiti.import("./permissions.ts");

const base = { tools: [], mcpAllowed: [], extensionTools: [], sandbox: "none", webAllowHosts: "any" };
const FULL = ["bash", "read", "edit", "write", "grep", "find", "ls"];

test("Julien-like: full preset, MCP, no host list -> 3/3", () => {
  assert.deepEqual(assessTrifecta({ ...base, tools: FULL, mcpAllowed: ["github"] }), { privateData: true, untrustedContent: true, exfiltration: true });
});

test("Martin-like: read-only preset, no MCP -> nothing", () => {
  assert.deepEqual(assessTrifecta({ ...base, tools: ["read", "grep", "find", "ls"] }), { privateData: true, untrustedContent: false, exfiltration: false });
});

test("no bash: no network exfiltration unless an external tool and any host", () => {
  const p = { ...base, tools: ["read"] };
  assert.equal(assessTrifecta(p).exfiltration, false);
  assert.equal(assessTrifecta({ ...p, extensionTools: ["fetch_content"] }).exfiltration, true);
  assert.equal(assessTrifecta({ ...p, extensionTools: ["fetch_content"], webAllowHosts: ["a.example.com"] }).exfiltration, false);
});

test("MCP servers, search tools and unknown extension tools are exfiltration (I1)", () => {
  const p = { ...base, tools: ["read"], webAllowHosts: ["a.example.com"] };
  assert.deepEqual(explainTrifecta({ ...p, mcpAllowed: ["fetch"] }).exfiltration, ["mcp:fetch"]);
  assert.deepEqual(explainTrifecta({ ...p, extensionTools: ["web_search"] }).exfiltration, ["web_search"]);
  assert.deepEqual(explainTrifecta({ ...p, extensionTools: ["source_check", "get_search_content"] }).exfiltration, ["source_check"]);
  assert.deepEqual(explainTrifecta({ ...base, tools: ["read"], extensionTools: "unknown-until-start" }).exfiltration, ["extension tools unknown"]);
  assert.deepEqual(explainTrifecta({ ...p, extensionTools: "unknown-until-start" }).exfiltration, []);
});

test("read-only preset + MCP server + unstarted thread -> 3/3", () => {
  const p = buildAgentPermissions({ ...agent, toolsPreset: "read-only", mcpServers: ["fetch"] }, { configuredMcpServers: ["fetch"], extensionTools: "unknown-until-start", triggers: [] });
  assert.deepEqual(p.trifecta, { privateData: true, untrustedContent: true, exfiltration: true });
  assert.deepEqual(p.trifectaReasons.exfiltration, ["mcp:fetch", "extension tools unknown"]);
  assert.deepEqual(p.trifectaReasons.untrustedContent, ["mcp:fetch"]);
});

test("a sandbox clears private data; a webhook trigger is untrusted content", () => {
  assert.equal(assessTrifecta({ ...base, tools: FULL, sandbox: "bubblewrap" }).privateData, false);
  assert.equal(assessTrifecta({ ...base, hasWebhookTrigger: true }).untrustedContent, true);
});

const agent = { name: "Julien", toolsPreset: "full", mcpServers: ["github"], home: "/h", role: "r", createdAt: "", avatar: { emoji: "x", color: "#aaaaaa" } };
const trig = (o) => ({ id: "t1", name: "alerts", profile: "Julien", enabled: true, ...o });

test("buildAgentPermissions maps the profile, defaults and triggers", () => {
  const p = buildAgentPermissions(agent, {
    configuredMcpServers: ["github", "slack", "db"], extensionTools: "unknown-until-start",
    triggers: [trig({ webhookSecretSha256: "ab", tools: ["read"] }), trig({ id: "t2", name: "tick", runTarget: "isolated" }), trig({ id: "t3", profile: "Other" })],
  });
  assert.deepEqual(p.tools, FULL);
  assert.equal(p.preset, "full");
  assert.equal(p.mcpBlockedCount, 2);
  assert.deepEqual(p.memory, { capture: "auto", save: "direct" });
  assert.equal(p.webAllowHosts, "any");
  assert.deepEqual(p.commandDeny, []);
  assert.deepEqual(p.triggers, [{ id: "t1", name: "alerts", tools: ["read"], target: "isolated" }, { id: "t2", name: "tick", tools: [], target: "isolated" }]);
  assert.deepEqual(p.trifecta, { privateData: true, untrustedContent: true, exfiltration: true });
  assert.equal(p.notCovered.length, 2);
  assert.equal(p.env, "sanitized");
});

test("explicit settings and known extension tools", () => {
  const p = buildAgentPermissions({ ...agent, mcpServers: [], memorySave: "staged", memoryCapture: "off", commandDeny: ["rm"], webAllowHosts: ["a.example.com"] },
    { configuredMcpServers: [], extensionTools: ["agent_notify"], triggers: [] });
  assert.deepEqual(p.memory, { capture: "off", save: "staged" });
  assert.deepEqual(p.webAllowHosts, ["a.example.com"]);
  assert.deepEqual(p.notCovered, ["MCP servers from host imports or plugins are not listed"]);
  assert.equal(p.mcpBlockedCount, 0);
});
