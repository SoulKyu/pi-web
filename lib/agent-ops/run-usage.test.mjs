import assert from "node:assert/strict";
import test from "node:test";
const { createUsageCollector } = await (await import("jiti")).createJiti(import.meta.url).import("./run-usage.ts");
test("sums assistant usage, counts turns and top-level tool calls, keeps the last model (Review Focus 3: only the run's own events)", () => {
  const c = createUsageCollector();
  c.observe({ type: "tool_execution_start", toolCallId: "a", toolName: "read", args: {} });
  c.observe({ type: "tool_execution_start", toolCallId: "a/1", parentToolCallId: "a", toolName: "read", args: {} }); // nested: not counted
  c.observe({ type: "message_end", message: { role: "assistant", model: "claude-opus-5-5", provider: "claude-bridge", usage: { input: 10, output: 5, cacheRead: 100, cacheWrite: 0, cost: { total: 0 } } } });
  c.observe({ type: "message_end", message: { role: "assistant", model: "glm-5.3-flash", provider: "zai", usage: { input: 1, output: 1, cost: { total: 0.002 } } } });
  c.observe({ type: "message_end", message: { role: "user" } });
  assert.deepEqual(c.snapshot(), { input: 11, output: 6, cacheRead: 100, cacheWrite: 0, cost: 0.002, turns: 2, toolCalls: 1, externalTools: false, model: "glm-5.3-flash", provider: "zai" });
});

const tainted = (...starts) => {
  const c = createUsageCollector();
  for (const [toolName, parentToolCallId] of starts) c.observe({ type: "tool_execution_start", toolCallId: toolName, parentToolCallId, toolName, args: {} });
  return c.snapshot().externalTools;
};

test("externalTools: any tool outside the local allowlist taints, nested or top-level", () => {
  assert.equal(tainted(["codemode"]), true);
  assert.equal(tainted(["mcp__fetch", "codemode"]), true);
  assert.equal(tainted(["bash"]), true);
  assert.equal(tainted(["web_search"]), true);
  assert.equal(tainted(["some_custom_tool"]), true);
  assert.equal(tainted(["read"], ["write"], ["agent_notify"]), false);
  assert.equal(tainted(), false);
});
