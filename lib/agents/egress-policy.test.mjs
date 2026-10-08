import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-egress-policy-"));
const { HOST_RE, hostAllowed, urlsOfToolInput, egressDenyReason, createEgressPolicyExtension } = await (await import("jiti")).createJiti(import.meta.url).import("./egress-policy.ts");

const ADAPTER_PATH = "/home/u/.pi/agent/npm/node_modules/pi-mcp-adapter/index.ts";
const fakePi = (onHandler) => ({
  on: (name, fn) => { if (name === "tool_call") onHandler(fn); },
  getAllTools: () => [{ name: "fetch_fetch", sourceInfo: { path: ADAPTER_PATH } }, { name: "mcp", sourceInfo: { path: ADAPTER_PATH } }, { name: "mcpScript", sourceInfo: { path: ADAPTER_PATH } }, { name: "bash", sourceInfo: { path: "builtin" } }],
});

test("hostAllowed: exact, case, port ignored", () => {
  assert.equal(hostAllowed("https://Example.com:8443/x", ["example.com"]), true);
  assert.equal(hostAllowed("https://a.example.com/", ["example.com"]), false);
  assert.equal(hostAllowed("https://example.com/", ["EXAMPLE.com"]), true);
  assert.equal(hostAllowed("https://other.org/", ["example.com"]), false);
});
test("hostAllowed: wildcard matches subdomains, not the apex", () => {
  assert.equal(hostAllowed("https://a.example.com/", ["*.example.com"]), true);
  assert.equal(hostAllowed("https://a.b.example.com/", ["*.example.com"]), true);
  assert.equal(hostAllowed("https://example.com/", ["*.example.com"]), false);
  assert.equal(hostAllowed("https://example.com/", ["*.example.com", "example.com"]), true);
  assert.equal(hostAllowed("https://badexample.com/", ["*.example.com"]), false);
});
test("hostAllowed: invalid URL and IP literals", () => {
  assert.equal(hostAllowed("not a url", ["example.com"]), false);
  assert.equal(hostAllowed("http://10.0.0.1/", ["10.0.0.1"]), true);
  assert.equal(hostAllowed("http://10.0.0.2/", ["10.0.0.1"]), false);
  assert.equal(hostAllowed("http://10.0.0.1/", ["*.0.0.1"]), false);
});
test("HOST_RE accepts hosts and wildcards", () => {
  assert.ok(HOST_RE.test("example.com") && HOST_RE.test("*.example.com"));
  assert.ok(!HOST_RE.test("localhost") && !HOST_RE.test("a b.com"));
});
test("urlsOfToolInput per tool shape", () => {
  assert.deepEqual(urlsOfToolInput("fetch_content", { url: "https://a.com", urls: ["https://b.com", 3] }), ["https://a.com", "https://b.com"]);
  assert.deepEqual(urlsOfToolInput("mcp__fetch__fetch", { url: "https://a.com", uri: "https://c.com", urls: ["https://b.com"], note: "see https://x.com" }), ["https://a.com", "https://c.com", "https://b.com"]);
  assert.deepEqual(urlsOfToolInput("mcp", { tool: "fetch", args: { url: "https://a.com" }, url: "https://top.com" }), ["https://a.com", "https://top.com"]);
  assert.deepEqual(urlsOfToolInput("mcp", { tool: "x" }), []);
  assert.deepEqual(urlsOfToolInput("web_search", { query: "https://a.com" }), []);
  assert.deepEqual(urlsOfToolInput("bash", { url: "https://a.com" }), []);
  assert.deepEqual(urlsOfToolInput("fetch_content", undefined), []);
});
test("egressDenyReason", () => {
  assert.equal(egressDenyReason("fetch_content", { url: "https://a.com" }, ["a.com"]), null);
  assert.equal(egressDenyReason("fetch_content", { url: "https://b.com/x" }, ["a.com"]), "web host not allowed by the agent's policy: b.com");
  assert.equal(egressDenyReason("fetch_content", { url: "nope" }, ["a.com"]), "web host not allowed by the agent's policy: invalid URL");
  assert.equal(egressDenyReason("bash", { url: "https://b.com" }, ["a.com"]), null);
});
test("the hook blocks nested and multi-url calls, passes search, fails closed", () => {
  let handler;
  createEgressPolicyExtension(["a.com"]).factory(fakePi((fn) => { handler = fn; }));
  assert.equal(handler({ toolName: "mcp__fetch__fetch", parentToolCallId: "p", input: { url: "https://evil.com" } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_content", input: { urls: ["https://a.com", "https://evil.com"] } }, {}).block, true);
  assert.equal(handler({ toolName: "mcp", input: { tool: "fetch", args: { url: "https://evil.com" } } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_content", input: { url: "https://a.com" } }, {}), undefined);
  assert.equal(handler({ toolName: "web_search", input: { query: "x" } }, {}), undefined);
  assert.deepEqual(handler({ toolName: "fetch_content", get input() { throw new Error("boom"); } }, {}), { block: true, reason: "egress policy error" });
});

test("hostAllowed refuses backslash, userinfo and non-network protocols (M4)", () => {
  assert.equal(hostAllowed("http://allowed.com\\@evil.com", ["allowed.com"]), false);
  assert.equal(hostAllowed("http://user@allowed.com", ["allowed.com"]), false);
  assert.equal(hostAllowed("file://allowed.com/x", ["allowed.com"]), false);
  assert.equal(hostAllowed("wss://allowed.com/x", ["allowed.com"]), true);
});
test("proxy and search-result fetching are blocked (C1)", () => {
  assert.equal(egressDenyReason("fetch_content", { url: "https://a.com", proxy: "http://evil.com:8080" }, ["a.com"]), "proxy not allowed by the agent's policy");
  assert.equal(egressDenyReason("web_search", { query: "x", proxy: "http://evil.com" }, ["a.com"]), "proxy not allowed by the agent's policy");
  assert.equal(egressDenyReason("web_search", { query: "x", includeContent: true }, ["a.com"]), "fetching search results is not allowed by the agent's policy");
  assert.equal(egressDenyReason("source_check", { query: "x", fetchContent: true }, ["a.com"]), "fetching search results is not allowed by the agent's policy");
  assert.equal(egressDenyReason("web_search", { query: "x", includeContent: false }, ["a.com"]), null);
  assert.equal(egressDenyReason("web_search", { query: "x" }, ["a.com"]), null);
});
test("generic mcp tool: string args, install, top-level url (C2)", () => {
  assert.equal(egressDenyReason("mcp", { tool: "fetch", args: '{"url":"https://evil.com"}' }, ["a.com"]), "web host not allowed by the agent's policy: evil.com");
  assert.equal(egressDenyReason("mcp", { tool: "fetch", args: "{nope" }, ["a.com"]), "invalid mcp args");
  assert.equal(egressDenyReason("mcp", { tool: "fetch", args: '{"url":"https://a.com"}' }, ["a.com"]), null);
  assert.match(egressDenyReason("mcp", { action: "install", url: "https://a.com/pkg" }, ["a.com"]), /install/);
  assert.match(egressDenyReason("mcp", { tool: "x", url: "https://evil.com" }, ["a.com"]), /evil\.com/);
});
test("the hook covers adapter tools: nested params, namespace args, mcpScript (C3)", () => {
  let handler;
  createEgressPolicyExtension(["a.com"]).factory(fakePi((fn) => { handler = fn; }));
  assert.equal(handler({ toolName: "fetch_fetch", input: { params: { target: "https://evil.com" } } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_fetch", input: { params: { target: "https://a.com" } } }, {}), undefined);
  assert.equal(handler({ toolName: "mcpScript", input: { code: "1" } }, {}).block, true);
  assert.equal(handler({ toolName: "mcp", input: { tool: "fetch", args: '{"url":"https://evil.com"}' } }, {}).block, true);
  assert.equal(handler({ toolName: "bash", input: { command: "curl https://evil.com" } }, {}), undefined);
});
test("deepUrls normalises leading/internal whitespace before matching (C4)", () => {
  let handler;
  createEgressPolicyExtension(["a.com"]).factory(fakePi((fn) => { handler = fn; }));
  assert.equal(handler({ toolName: "fetch_fetch", input: { url: " https://evil.com/x" } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_fetch", input: { url: "ht\ttps://evil.com/x" } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_fetch", input: { url: " https://a.com/x" } }, {}), undefined);
});
