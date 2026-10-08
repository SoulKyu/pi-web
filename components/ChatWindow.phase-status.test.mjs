import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("the live region announces the phase without tool progress; the visible label stays outside it", () => {
  const start = source.indexOf('aria-live="polite"');
  assert.ok(start >= 0, "status region exists");
  const end = source.indexOf("</div>", start);
  const region = source.slice(start, end);
  assert.match(region, /aria-live="polite"/);
  assert.match(region, /position: "absolute", width: 1, height: 1/);
  assert.match(region, /phaseAnnouncement\(agentPhase, t, isCompacting\)/);
  assert.match(region, /\{bashRunning && !pendingBash && t\("chat\.runningCommand"\)\}/);
  assert.doesNotMatch(region, /phaseLabel\(/);
  const visible = source.slice(end, source.indexOf("{pendingBash && (", end));
  assert.match(visible, /phaseLabel\(agentPhase, t, isCompacting\)/);
  assert.doesNotMatch(visible, /aria-live/);
});
