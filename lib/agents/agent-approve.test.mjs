import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agent-approve-"));
const { createAgentApproveExtension, AGENT_APPROVE_TOOL, APPROVE_TIMEOUT_MS } = await (await import("jiti")).createJiti(import.meta.url).import("./agent-approve.ts");

function setup(agentName, notify, timeoutMs) {
  const tools = [];
  createAgentApproveExtension({ agentName, notify, timeoutMs }).factory({ registerTool: (tool) => tools.push(tool), on: () => {} });
  return tools[0];
}
const ctxWith = (answer, calls = []) => ({ ui: { confirm: async (title, message, opts) => { calls.push({ title, message, opts }); return answer; } } });

test("approved: confirm true gives 'approved' and one push with the agent URL and tag", async () => {
  const pushes = [];
  const tool = setup("leandro", async (payloadFor) => void pushes.push(payloadFor("en")));
  assert.equal(tool.name, AGENT_APPROVE_TOOL);
  const calls = [];
  const result = await tool.execute("call-1", { title: "Deploy prod", summary: "v2 to prod" }, undefined, undefined, ctxWith(true, calls));
  assert.equal(result.content[0].text, "approved");
  assert.deepEqual(result.details, { kind: "agent-approve", title: "Deploy prod", decision: "approved" });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].url, "/?agent=leandro");
  assert.equal(pushes[0].title, "leandro");
  assert.match(pushes[0].body, /leandro/);
  assert.match(pushes[0].body, /Deploy prod/);
  assert.equal(pushes[0].tag, "pi-agent-approve:leandro:call-1");
  assert.deepEqual(calls[0], { title: "Deploy prod", message: "v2 to prod", opts: { timeout: APPROVE_TIMEOUT_MS } });
});

test("denied: confirm false gives 'denied'; a failing push does not block", async () => {
  const tool = setup("a", async () => { throw new Error("push down"); });
  const logged = test.mock.method(console, "error", () => {});
  const result = await tool.execute("c", { title: "t", summary: "s" }, undefined, undefined, ctxWith(false));
  assert.equal(logged.mock.callCount(), 1);
  logged.mock.restore();
  assert.equal(result.content[0].text, "denied");
  assert.equal(result.details.decision, "denied");
});

test("a context without ui is denied without throwing", async () => {
  const tool = setup("a", async () => {});
  const result = await tool.execute("c", { title: "t", summary: "s" }, undefined, undefined, {});
  assert.equal(result.content[0].text, "denied");
});

test("the description says it is a request, not a guarantee", () => {
  const { description } = setup("a", async () => {});
  assert.match(description, /request/);
  assert.match(description, /not a guarantee/);
});

test("title and summary are clipped; the timeout is configurable", async () => {
  const tool = setup("a", async () => {}, 1234);
  const calls = [];
  await tool.execute("c", { title: "t".repeat(300), summary: "s".repeat(2000) }, undefined, undefined, ctxWith(true, calls));
  assert.equal(calls[0].title.length, 120);
  assert.equal(calls[0].message.length, 1000);
  assert.deepEqual(calls[0].opts, { timeout: 1234 });
});
