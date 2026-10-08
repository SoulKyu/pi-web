import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("the phase label and the bash-running line sit in one always-mounted polite status region", () => {
  const start = source.indexOf('<div role="status" aria-live="polite">');
  assert.ok(start >= 0, "status region exists");
  const region = source.slice(start, source.indexOf("{pendingBash && (", start));
  assert.match(region, /\{agentRunning && !hasStreamingContent && \(agentPhase \|\| isCompacting\) && \(/);
  assert.match(region, /phaseLabel\(agentPhase, t, isCompacting\)/);
  assert.match(region, /\{bashRunning && !pendingBash && \(/);
  assert.match(region, /t\("chat\.runningCommand"\)/);
  assert.match(region, /<\/div>\s*$/);
});
