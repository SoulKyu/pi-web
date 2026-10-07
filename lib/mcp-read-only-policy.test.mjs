import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createReadOnlyMcpPolicyExtension, isMcpTool, isReadOnlySelection } = await jiti.import("./mcp-read-only-policy.ts");

test("a pinned selection is read-only when it names tools and none can write or run commands", () => {
  assert.equal(isReadOnlySelection(["read", "grep", "find", "ls"]), true);
  assert.equal(isReadOnlySelection(["read"]), true);
  // No pin follows pi's configured tools, and an empty pin is Chat only, which loads no MCP.
  assert.equal(isReadOnlySelection(undefined), false);
  assert.equal(isReadOnlySelection([]), false);
  for (const writer of ["bash", "powershell", "edit", "write"]) {
    assert.equal(isReadOnlySelection(["read", writer]), false, writer);
  }
});

test("MCP tools are the MCP extension's and any named mcp__", () => {
  const source = (path) => ({ path, source: "builtin", scope: "user", origin: "top-level" });
  assert.equal(isMcpTool({ name: "read_mcp_resource", sourceInfo: source("builtin:mcp") }), true);
  assert.equal(isMcpTool({ name: "mcp__docs__search", sourceInfo: source("/ext/other-mcp.ts") }), true);
  assert.equal(isMcpTool({ name: "web_search", sourceInfo: source("/ext/search.ts") }), false);
  assert.equal(isMcpTool({ name: "codemode", sourceInfo: source("builtin:codemode") }), false);
});

test("pi-mcp-adapter tools are MCP tools whatever their name", () => {
  const source = (path) => ({ path, source: "npm", scope: "user", origin: "package" });
  assert.equal(isMcpTool({ name: "github_create_issue", sourceInfo: source("/home/u/.pi/agent/npm/node_modules/pi-mcp-adapter/index.ts") }), true);
  assert.equal(isMcpTool({ name: "github_create_issue", sourceInfo: source("/ext/not-pi-mcp-adapter-fork/index.ts") }), false);
});

function runPolicy(selection, tools, entries, toolName) {
  let hook;
  createReadOnlyMcpPolicyExtension({ selection }).factory({
    on: (_event, handler) => { hook = handler; },
    getAllTools: () => tools,
  });
  return hook({ toolName }, { sessionManager: { getEntries: () => entries } });
}

test("with a profile-style selection, a read-only snapshot blocks MCP tools without readOnlyHint", () => {
  const adapter = { path: "/h/.pi/agent/npm/node_modules/pi-mcp-adapter/index.ts" };
  const tools = [
    { name: "gh_write", sourceInfo: adapter },
    { name: "gh_read", sourceInfo: adapter, annotations: { readOnlyHint: true } },
    { name: "read", sourceInfo: { path: "builtin:read" } },
  ];
  const profile = [{ type: "custom", customType: "pi-web:agent-profile", data: { version: 1, profile: "a", resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: ["read", "grep"] } } }];
  const selection = (entries) => entries[0].data.resourceSnapshot.tools;
  assert.equal(runPolicy(selection, tools, profile, "gh_write")?.block, true);
  assert.equal(runPolicy(selection, tools, profile, "gh_read"), undefined);
  assert.equal(runPolicy(selection, tools, profile, "read"), undefined);
  assert.equal(runPolicy(() => ["read", "bash"], tools, profile, "gh_write"), undefined);
});
