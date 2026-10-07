import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source pins: importing kick.ts would load rpc-manager.
const source = readFileSync(new URL("./kick.ts", import.meta.url), "utf8");

test("kickRunner drives an isolated runner and a per-agent thread runner", () => {
  assert.match(source, /slotKey: "__agentOpsRunning"[\s\S]*select: \(queued\) => selectIsolatedTasks\(queued, pausedNow\)/);
  assert.match(source, /slotKey: "__agentOpsThreadRunning"[\s\S]*selectThreadTasks\(/);
  assert.match(source, /maxConcurrent: Number\.POSITIVE_INFINITY/);
  assert.match(source, /start: startThreadEventRun/);
  assert.equal(source.match(/capacity,/g)?.length, 2);
  assert.equal(source.match(/onTaskEnd: handleTaskEnd/g)?.length, 2);
});

test("a starting thread counts as busy", () => {
  assert.match(source, /isRpcSessionStarting\(/);
});

test("a finished webhook run posts a display-only summary card without blocking or throwing", () => {
  const end = source.slice(source.indexOf("export function handleTaskEnd"), source.indexOf("export function kickRunner") > 0 ? source.indexOf("/** Single runner entry point") : undefined);
  assert.match(end, /if \(task\.target === "isolated"\)/);
  assert.match(end, /webhookEventOfTask\(\{ \.\.\.task, result: task\.result && redactSecrets\(task\.result\), error: task\.error && redactSecrets\(task\.error\) \}\)/);
  assert.match(end, /void appendThreadEvent\(agent, event\)\.catch\(/);
});

test("an isolated start re-checks the task and the pause before its prompt", () => {
  assert.match(source, /startAgentProfileRun\(task, \(\) => assertTaskStillStartable\(task\)\)/);
});
