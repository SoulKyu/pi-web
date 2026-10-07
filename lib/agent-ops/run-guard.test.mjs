import assert from "node:assert/strict";
import test from "node:test";
const { createRunGuard, RunGuardError } = await (await import("jiti")).createJiti(import.meta.url).import("./run-guard.ts");
const start = (toolName, args) => ({ type: "tool_execution_start", toolCallId: Math.random().toString(), toolName, args });
test("five identical consecutive calls trip the guard; a different call resets the streak", () => {
  const g = createRunGuard({ maxIdenticalCalls: 5, maxToolCalls: 150, maxTurns: 60 });
  for (let i = 0; i < 4; i++) assert.equal(g.observe(start("fetch_content", { url: "x" })), undefined);
  assert.equal(g.observe(start("read", { path: "a" })), undefined);
  for (let i = 0; i < 4; i++) assert.equal(g.observe(start("fetch_content", { url: "x" })), undefined);
  const error = g.observe(start("fetch_content", { url: "x" }));
  assert.ok(error instanceof RunGuardError); assert.equal(error.rule, "identical-calls"); assert.match(error.message, /fetch_content × 5/);
});
test("total tool calls and turns are capped; nested calls do not count", () => {
  const g = createRunGuard({ maxIdenticalCalls: 99, maxToolCalls: 3, maxTurns: 2 });
  g.observe({ ...start("read", { path: "n" }), parentToolCallId: "p" });
  assert.equal(g.observe(start("read", { path: "1" })), undefined); assert.equal(g.observe(start("read", { path: "2" })), undefined);
  assert.equal(g.observe(start("read", { path: "3" }))?.rule, "tool-calls");
  const h = createRunGuard({ maxIdenticalCalls: 99, maxToolCalls: 99, maxTurns: 2 });
  h.observe({ type: "message_end", message: { role: "assistant" } }); assert.equal(h.observe({ type: "message_end", message: { role: "assistant" } })?.rule, "turns");
});
