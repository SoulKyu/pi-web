import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source pins: importing kick.ts would load rpc-manager.
const source = readFileSync(new URL("./kick.ts", import.meta.url), "utf8");

test("kickRunner drives an isolated runner and a per-agent thread runner", () => {
  assert.match(source, /slotKey: "__agentOpsRunning"[\s\S]*select: selectIsolatedTasks/);
  assert.match(source, /slotKey: "__agentOpsThreadRunning"[\s\S]*selectThreadTasks\(/);
  assert.match(source, /maxConcurrent: Number\.POSITIVE_INFINITY/);
  assert.match(source, /start: startThreadEventRun/);
  assert.equal(source.match(/onTaskEnd: handleTaskEnd/g)?.length, 2);
});

test("a starting thread counts as busy", () => {
  assert.match(source, /isRpcSessionStarting\(/);
});
