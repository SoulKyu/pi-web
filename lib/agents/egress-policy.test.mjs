import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-egress-policy-"));
const { HOST_RE, hostAllowed, urlsOfToolInput, egressDenyReason, createEgressPolicyExtension } = await (await import("jiti")).createJiti(import.meta.url).import("./egress-policy.ts");

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
  assert.deepEqual(urlsOfToolInput("mcp__fetch__fetch", { url: "https://a.com", uri: "https://c.com", urls: ["https://b.com"], other: "https://x.com" }), ["https://a.com", "https://c.com", "https://b.com"]);
  assert.deepEqual(urlsOfToolInput("mcp", { tool: "fetch", args: { url: "https://a.com" }, url: "https://ignored.com" }), ["https://a.com"]);
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
  createEgressPolicyExtension(["a.com"]).factory({ on: (name, fn) => { if (name === "tool_call") handler = fn; } });
  assert.equal(handler({ toolName: "mcp__fetch__fetch", parentToolCallId: "p", input: { url: "https://evil.com" } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_content", input: { urls: ["https://a.com", "https://evil.com"] } }, {}).block, true);
  assert.equal(handler({ toolName: "mcp", input: { tool: "fetch", args: { url: "https://evil.com" } } }, {}).block, true);
  assert.equal(handler({ toolName: "fetch_content", input: { url: "https://a.com" } }, {}), undefined);
  assert.equal(handler({ toolName: "web_search", input: { query: "x" } }, {}), undefined);
  assert.deepEqual(handler({ toolName: "fetch_content", get input() { throw new Error("boom"); } }, {}), { block: true, reason: "egress policy error" });
});
