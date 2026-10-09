import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { authorOf, createGroupTracker, GROUP_GAP_MS } = await jiti.import("./author-groups.ts");
const { presenceOf } = await jiti.import("./presence.ts");
const { formatListTime } = await jiti.import("./list-time.ts");
const { readDetails, readRailExpanded } = await jiti.import("./prefs.ts");

test("authorOf maps roles; recall cards and tool results are ignored; event prompts are system", () => {
  assert.equal(authorOf({ role: "user" }), "user");
  assert.equal(authorOf({ role: "user" }, { eventPrompt: true }), "system");
  assert.equal(authorOf({ role: "bashExecution" }), "user");
  assert.equal(authorOf({ role: "assistant" }), "agent");
  assert.equal(authorOf({ role: "toolResult" }), null);
  assert.equal(authorOf({ role: "custom", customType: "memory-recall" }), null);
  assert.equal(authorOf({ role: "custom", customType: "agent-event" }), "system");
  assert.equal(authorOf({ role: "custom", customType: "compaction" }), "system");
});

test("a group opens on author change, on a break, past the gap, or without a timestamp", () => {
  const groups = createGroupTracker();
  const t0 = Date.UTC(2026, 9, 9, 12);
  assert.equal(groups.open("user", t0), true);
  assert.equal(groups.open("user", t0 + 60_000), false);
  assert.equal(groups.open("agent", t0 + 61_000), true);
  assert.equal(groups.open("agent", t0 + 61_000 + GROUP_GAP_MS - 1), false);
  assert.equal(groups.open("agent", t0 + 61_000 + 2 * GROUP_GAP_MS), true, "gap reached");
  assert.equal(groups.open("agent", t0 + 61_000 + 2 * GROUP_GAP_MS + 1, true), true, "day separator or unread divider");
  assert.equal(groups.open("agent", undefined), true, "missing timestamp never merges");
  assert.equal(groups.open("system", t0), false, "system lines never get a header");
  assert.equal(groups.last(), "system");
  assert.equal(groups.open("agent", t0 + 1), true, "a system line breaks the group");
});

test("presence follows the rail priority, paused and quiet hours after the states", () => {
  const base = { state: "idle", paused: false, globalPaused: false, quietHours: false };
  assert.deepEqual(presenceOf({ ...base, state: "needs_input", paused: true }), { key: "needsInput", tone: "orange" });
  assert.deepEqual(presenceOf({ ...base, state: "running" }), { key: "working", tone: "cyan" });
  assert.deepEqual(presenceOf({ ...base, state: "failed" }), { key: "failed", tone: "red" });
  assert.deepEqual(presenceOf({ ...base, globalPaused: true }), { key: "paused", tone: "dim" });
  assert.deepEqual(presenceOf({ ...base, paused: true, quietHours: true }), { key: "paused", tone: "dim" });
  assert.deepEqual(presenceOf({ ...base, quietHours: true }), { key: "quietHours", tone: "dim" });
  assert.deepEqual(presenceOf(base), { key: "available", tone: "dim" });
});

test("list time: today clock, yesterday word, weekday under 7 days, short date after, year outside this year", () => {
  const now = new Date(2026, 9, 9, 15, 0);
  assert.equal(formatListTime(new Date(2026, 9, 9, 14, 5).toISOString(), "fr", now), "14:05");
  assert.equal(formatListTime(new Date(2026, 9, 8, 23, 59).toISOString(), "fr", now), "hier");
  const sixDays = new Date(2026, 9, 3, 10);
  assert.equal(formatListTime(sixDays.toISOString(), "fr", now), sixDays.toLocaleDateString("fr", { weekday: "short" }));
  const eightDays = new Date(2026, 9, 1, 10);
  assert.equal(formatListTime(eightDays.toISOString(), "fr", now), eightDays.toLocaleDateString("fr", { day: "numeric", month: "short" }));
  const lastYear = new Date(2025, 11, 31, 10);
  assert.equal(formatListTime(lastYear.toISOString(), "fr", now), lastYear.toLocaleDateString("fr", { day: "numeric", month: "short", year: "numeric" }));
  assert.equal(formatListTime("not a date", "fr", now), "");
});

test("prefs: details only on for 'on'; rail follows the stored value, else the viewport", () => {
  assert.equal(readDetails("on"), true);
  assert.equal(readDetails("off"), false);
  assert.equal(readDetails(null), false);
  assert.equal(readDetails("garbage"), false);
  assert.equal(readRailExpanded("on", 800), true);
  assert.equal(readRailExpanded("off", 1920), false);
  assert.equal(readRailExpanded(null, 1280), true);
  assert.equal(readRailExpanded("garbage", 1279), false);
});
