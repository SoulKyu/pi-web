import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const fn = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
};

test("no off-palette colors or JS hover handlers remain in the sidebar", () => {
  assert.doesNotMatch(source, /#ef4444|#dc2626|#0891b2|#d97706|rgba\(239,\s*68,\s*68/);
  assert.doesNotMatch(fn("ToolbarIconButton"), /onMouseEnter|onMouseLeave/);
});

test("the title is a HUD label", () => {
  assert.match(fn("PiWebTitle"), /font-hud/);
});

test("running and unread indicators are labelled LEDs (orange running, cyan unread)", () => {
  assert.match(fn("RunningSessionIndicator"), /<Led status="running" label=\{t\("sidebar\.agentRunning"\)\}/);
  assert.match(fn("UnreadSessionIndicator"), /<Led status="done" label=\{t\("sidebar\.newSessionActivity"\)\}/);
});

test("the selected row has the orange trace; every state keeps the fixed row height", () => {
  const item = fn("SessionItem");
  assert.match(item, /height: SESSION_LIST_ITEM_HEIGHT/);
  assert.match(item, /isSelected && !confirmDelete && "border-l-tron-orange bg-\[linear-gradient\(90deg,rgb\(255_154_0\/0\.12\),transparent\)\]/);
  assert.match(item, /confirmDelete && "border-l-tron-red/);
});

test("rename uses the shared Tron field style", () => {
  assert.match(fn("SessionItem"), /className=\{cn\(fieldClass, "h-\[30px\] flex-1/);
});
