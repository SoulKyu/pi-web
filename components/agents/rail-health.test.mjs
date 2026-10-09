import assert from "node:assert/strict";
import test from "node:test";
import { healthPopoverLines, healthPopoverPosition } from "./rail-health.ts";

const t = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key);
const health = {
  lastTickAt: "2026-10-08T10:00:00.000Z",
  running: { isolated: 1, thread: 2 },
  sessionsAlive: 3,
  freeMb: 2048,
  extensionErrors: [{ sessionId: "s", key: "a", text: "boom" }, { sessionId: "s", key: "b", text: "second" }],
  paused: false,
  quietHours: true,
};

test("lines: level, tick, running, free memory, sessions, quiet hours, first extension error, pause error, stale", () => {
  const lines = healthPopoverLines({ health, level: "warn" }, { pauseError: "HTTP 500", staleTime: "14:02" }, t, () => "12:00");
  assert.deepEqual(lines, [
    "agents.health.warn",
    'agents.health.lastTick {"time":"12:00"}',
    'agents.health.running {"isolated":1,"thread":2}',
    'agents.health.freeMemory {"freeMb":2048}',
    'agents.health.sessions {"count":3}',
    "agentOps.quietHours.active",
    'agents.health.extensionError {"text":"boom"}',
    'agents.error {"error":"HTTP 500"}',
    'agents.rail.stale {"time":"14:02"}',
  ]);
});

test("missing gauges read as a dash; absent optional facts add no line", () => {
  const bare = { ...health, lastTickAt: null, freeMb: null, extensionErrors: [], quietHours: false };
  delete bare.sessionsAlive; // an older server without the field
  assert.deepEqual(healthPopoverLines({ health: bare, level: "ok" }, { pauseError: null, staleTime: null }, t, () => "never"), [
    "agents.health.ok",
    'agents.health.lastTick {"time":"–"}',
    'agents.health.running {"isolated":1,"thread":2}',
    'agents.health.freeMemory {"freeMb":"–"}',
  ]);
});

test("without a health answer only the pause error and the stale notice remain", () => {
  assert.deepEqual(healthPopoverLines(null, { pauseError: "offline", staleTime: null }, t, () => ""), ['agents.error {"error":"offline"}']);
  assert.deepEqual(healthPopoverLines(null, { pauseError: null, staleTime: null }, t, () => ""), []);
});

test("position: right of the vertical rail, below the horizontal one, clamped 8 px inside the viewport", () => {
  const desktop = { width: 1280, height: 800 };
  assert.deepEqual(healthPopoverPosition({ top: 100, left: 6, right: 38, bottom: 132 }, { width: 200, height: 150 }, desktop, "vertical"), { top: 100, left: 46 });
  assert.deepEqual(healthPopoverPosition({ top: 700, left: 6, right: 38, bottom: 732 }, { width: 200, height: 150 }, desktop, "vertical"), { top: 642, left: 46 });
  const phone = { width: 375, height: 667 };
  assert.deepEqual(healthPopoverPosition({ top: 6, left: 300, right: 332, bottom: 38 }, { width: 280, height: 200 }, phone, "horizontal"), { top: 46, left: 87 });
  assert.deepEqual(healthPopoverPosition({ top: 6, left: 300, right: 332, bottom: 38 }, { width: 400, height: 200 }, { width: 320, height: 568 }, "horizontal"), { top: 46, left: 8 });
});

test("position: a vertical anchor at the 240 px expanded rail edge opens beside the rail, not over the rows", () => {
  const { left } = healthPopoverPosition({ top: 100, left: 6, right: 240, bottom: 132 }, { width: 200, height: 150 }, { width: 1280, height: 800 }, "vertical");
  assert.ok(left >= 240 + 8, `left ${left}`);
});
