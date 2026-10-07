import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-mcp-access-")); // before the import
const access = await (await import("jiti")).createJiti(import.meta.url).import("./mcp-access.ts");

const root = mkdtempSync(join(tmpdir(), "mcp-access-"));
const home = join(root, "home");
const agentDir = join(root, "agent");
const options = { home, agentDir };
const put = (path, text) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); };

test("listGlobalMcpServers unions the adapter sources, skips disabled entries, never returns values", () => {
  assert.deepEqual(access.listGlobalMcpServers(options), []); // no file at all
  put(join(home, ".config/mcp/mcp.json"), `// comment\n{ "mcpServers": { "github": { "command": "npx", "env": { "TOKEN": "s3cret" } }, "off": { "disabled": true }, "also-off": { "enabled": false }, }, }`);
  put(join(home, ".agents/mcp.json"), JSON.stringify({ mcpServers: { github: { url: "https://dup" }, slack: { url: "https://secret.example" } } }));
  put(join(agentDir, "mcp.json"), JSON.stringify({ "mcp-servers": { alias: { command: "x" } } }));
  put(join(agentDir, "mcp-adapter.json"), "{ not json");
  put(join(home, ".agents/mcp/mcp.json"), JSON.stringify({ mcpServers: "nope" }));
  const names = access.listGlobalMcpServers(options);
  assert.deepEqual(names, ["alias", "github", "slack"]);
  assert.doesNotMatch(JSON.stringify(names), /s3cret|secret\.example/);
});

test("syncAgentMcpOverrides blocks every global server not allowed, with private modes", () => {
  const agentHome = join(root, "agent-home");
  mkdirSync(agentHome);
  access.syncAgentMcpOverrides(agentHome, ["github"], options);
  const path = access.agentMcpOverridesPath(agentHome);
  assert.equal(path, join(agentHome, ".pi", "mcp-adapter.json"));
  assert.equal(readFileSync(path, "utf8"), `${JSON.stringify({ mcpServers: { alias: { disabled: true }, slack: { disabled: true } } }, null, 2)}\n`);
  assert.equal(statSync(join(agentHome, ".pi")).mode & 0o777, 0o700);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("syncAgentMcpOverrides rewrites on change and leaves an unchanged file alone", () => {
  const agentHome = join(root, "agent-home-2");
  mkdirSync(agentHome);
  const path = access.agentMcpOverridesPath(agentHome);
  access.syncAgentMcpOverrides(agentHome, [], options);
  const past = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000);
  utimesSync(path, past, past);
  access.syncAgentMcpOverrides(agentHome, [], options);
  assert.equal(Math.round(statSync(path).mtimeMs), past.getTime()); // not rewritten
  access.syncAgentMcpOverrides(agentHome, ["alias", "github", "slack"], options);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { mcpServers: {} });
  writeFileSync(path, "hand edit");
  access.syncAgentMcpOverrides(agentHome, ["slack"], options);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(path, "utf8")).mcpServers), ["alias", "github"]);
});

test("an empty global list yields an empty mcpServers object", () => {
  const agentHome = join(root, "agent-home-3");
  mkdirSync(agentHome);
  access.syncAgentMcpOverrides(agentHome, ["x"], { home: join(root, "nowhere"), agentDir: join(root, "nowhere2") });
  assert.equal(readFileSync(access.agentMcpOverridesPath(agentHome), "utf8"), '{\n  "mcpServers": {}\n}\n');
});
