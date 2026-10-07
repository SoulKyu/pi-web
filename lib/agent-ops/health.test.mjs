import assert from "node:assert/strict";
import { test } from "node:test";
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { collectHealth, healthLevel } = await jiti.import("./health.ts");

const now = Date.parse("2026-10-07T12:00:00Z");
const base = { running: { isolated: 0, thread: 0 }, sessionsAlive: 2, freeMb: 4000, extensionErrors: [], paused: false };
const level = (over) => healthLevel(collectHealth({ ...base, lastTick: now - 60_000, ...over }), now);

test("collectHealth stamps lastTickAt as ISO and keeps null/undefined as null", () => {
  assert.equal(collectHealth({ ...base, lastTick: now }).lastTickAt, "2026-10-07T12:00:00.000Z");
  const none = collectHealth({ ...base });
  assert.equal(none.lastTickAt, null);
  assert.equal(none.freeMb ?? null, 4000);
  assert.equal(collectHealth({ ...base, freeMb: undefined }).freeMb, null);
});

test("healthLevel: recent tick is ok", () => assert.equal(level({}), "ok"));
test("healthLevel: tick 5 min ago is down", () => assert.equal(level({ lastTick: now - 300_000 }), "down"));
test("healthLevel: extension errors warn", () => assert.equal(level({ extensionErrors: [{ sessionId: "s", key: "k", text: "error: x" }] }), "warn"));
test("healthLevel: paused warns", () => assert.equal(level({ paused: true }), "warn"));
test("healthLevel: low free memory warns", () => assert.equal(level({ freeMb: 900 }), "warn"));
test("healthLevel: no tick yet (first tick is 60 s after start) warns, not down", () => assert.equal(level({ lastTick: undefined }), "warn"));

test("collectHealth carries the quietHours flag, false by default", () => {
  assert.equal(collectHealth({ ...base }).quietHours, false);
  assert.equal(collectHealth({ ...base, quietHours: true }).quietHours, true);
  assert.equal(level({ quietHours: true }), "ok");
});
