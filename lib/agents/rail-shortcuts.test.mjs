import assert from "node:assert/strict";
import test from "node:test";
import { nextUnreadAgent, nthAgent, railShortcutTarget } from "./rail-shortcuts.ts";

const agents = [
  { name: "A", unread: 0 },
  { name: "B", unread: 2 },
  { name: "C", unread: 0 },
  { name: "D", unread: 1 },
];

test("nextUnreadAgent cycles through unread agents only, wrapping around", () => {
  assert.equal(nextUnreadAgent(agents, "A", 1), "B");
  assert.equal(nextUnreadAgent(agents, "B", 1), "D");
  assert.equal(nextUnreadAgent(agents, "D", 1), "B");
  assert.equal(nextUnreadAgent(agents, "B", -1), "D");
  assert.equal(nextUnreadAgent(agents, "D", -1), "B");
  assert.equal(nextUnreadAgent(agents, "C", -1), "B");
  assert.equal(nextUnreadAgent(agents, null, 1), "B");
  assert.equal(nextUnreadAgent(agents, null, -1), "D");
});

test("nextUnreadAgent is null without an unread agent, and stays put on the only one", () => {
  assert.equal(nextUnreadAgent([{ name: "A", unread: 0 }], "A", 1), null);
  assert.equal(nextUnreadAgent([], null, 1), null);
  assert.equal(nextUnreadAgent([{ name: "A", unread: 3 }], "A", 1), "A");
});

test("nthAgent is 1-based in rail order", () => {
  assert.equal(nthAgent(agents, 1), "A");
  assert.equal(nthAgent(agents, 4), "D");
  assert.equal(nthAgent(agents, 5), null);
  assert.equal(nthAgent(agents, 0), null);
});

test("railShortcutTarget maps Alt+Arrow and Ctrl+Alt+digit, nothing else", () => {
  const ev = (key, mods = {}, code) => ({ key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  assert.equal(railShortcutTarget(ev("ArrowDown", { altKey: true }), agents, "A"), "B");
  assert.equal(railShortcutTarget(ev("ArrowUp", { altKey: true }), agents, "A"), "D");
  assert.equal(railShortcutTarget(ev("ArrowDown"), agents, "A"), null);
  assert.equal(railShortcutTarget(ev("ArrowDown", { altKey: true, ctrlKey: true }), agents, "A"), null);
  assert.equal(railShortcutTarget(ev("ArrowDown", { altKey: true, shiftKey: true }), agents, "A"), null);
  assert.equal(railShortcutTarget(ev("3", { altKey: true, ctrlKey: true }, "Digit3"), agents, "A"), "C");
  assert.equal(railShortcutTarget(ev("¡", { altKey: true, ctrlKey: true }, "Digit1"), agents, "B"), "A");
  assert.equal(railShortcutTarget(ev("9", { altKey: true, ctrlKey: true }, "Digit9"), agents, "A"), null);
  assert.equal(railShortcutTarget(ev("3", { altKey: true }, "Digit3"), agents, "A"), null);
  assert.equal(railShortcutTarget(ev("0", { altKey: true, ctrlKey: true }, "Digit0"), agents, "A"), null);
});
