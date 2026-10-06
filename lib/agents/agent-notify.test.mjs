import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agent-notify-"));
const { createAgentNotifyExtension, AGENT_NOTIFY_TOOL } = await (await import("jiti")).createJiti(import.meta.url).import("./agent-notify.ts");

function registerTool(agentName, notify) {
  const tools = [];
  createAgentNotifyExtension({ agentName, notify }).factory({ registerTool: (tool) => tools.push(tool), on: () => {} });
  return tools;
}

test("registers agent_notify, pushes the text with the agent URL, answers the model", async () => {
  const pushes = [];
  const tools = registerTool("leandro", async (payloadFor) => void pushes.push(payloadFor("en")));
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, AGENT_NOTIFY_TOOL);
  const result = await tools[0].execute("call-1", { text: "node-3 disk will be full in ~6 h" });
  assert.equal(pushes[0].title, "leandro");
  assert.equal(pushes[0].body, "node-3 disk will be full in ~6 h");
  assert.equal(pushes[0].url, "/?agent=leandro");
  assert.match(pushes[0].tag, /^pi-agent-notify:leandro:/);
  assert.equal(result.details.kind, "agent-notify");
  assert.match(result.content[0].text, /sent/);
});

test("trims and clips the body to 500 characters and encodes the agent name in the URL", async () => {
  const pushes = [];
  const tools = registerTool("a b", async (payloadFor) => void pushes.push(payloadFor("en")));
  await tools[0].execute("call-2", { text: `  ${"x".repeat(900)}  ` });
  assert.equal(pushes[0].body, "x".repeat(500));
  assert.equal(pushes[0].url, "/?agent=a%20b");
});
