import assert from "node:assert/strict";
import test from "node:test";
import { handleGlobalEscape, isShortcutsHelpKey, registerAbortHandler } from "./useKeyboardShortcuts.ts";

function keydown(key, { tagName = "BUTTON", defaultPrevented = false } = {}) {
  return {
    key,
    target: { tagName },
    defaultPrevented,
    preventDefault() { this.defaultPrevented = true; },
  };
}

test("Escape stops a running agent when nothing else took the key", (t) => {
  let stopped = 0;
  registerAbortHandler(() => { stopped += 1; });
  t.after(() => registerAbortHandler(null));

  const event = keydown("Escape");
  assert.equal(handleGlobalEscape(event), true);
  assert.equal(stopped, 1);
  assert.equal(event.defaultPrevented, true);
  // Focus on the page itself, as after a click on nothing in particular.
  assert.equal(handleGlobalEscape(keydown("Escape", { tagName: "BODY" })), true);
  assert.equal(stopped, 2);
  assert.equal(handleGlobalEscape(keydown("Enter")), false);
  assert.equal(stopped, 2);
});

test("an Escape something nearer already handled does not stop the agent too", (t) => {
  let stopped = 0;
  registerAbortHandler(() => { stopped += 1; });
  t.after(() => registerAbortHandler(null));

  // Settings, the Mermaid viewer or a menu closed on it and marked it handled.
  assert.equal(handleGlobalEscape(keydown("Escape", { defaultPrevented: true })), false);
  // ChatInput and other fields keep their own Escape.
  assert.equal(handleGlobalEscape(keydown("Escape", { tagName: "TEXTAREA" })), false);
  assert.equal(handleGlobalEscape(keydown("Escape", { tagName: "INPUT" })), false);
  assert.equal(stopped, 0);
});

test("with no run to stop, Escape is left alone", () => {
  registerAbortHandler(null);
  const event = keydown("Escape");
  assert.equal(handleGlobalEscape(event), false);
  assert.equal(event.defaultPrevented, false);
});

function questionMark({ tagName = "BODY", isContentEditable = false, defaultPrevented = false, isComposing = false, metaKey = false } = {}) {
  return { key: "?", target: { tagName, isContentEditable }, defaultPrevented, isComposing, metaKey };
}

test("? opens the shortcuts dialog from the page, never from a field, an open dialog or an IME", () => {
  assert.equal(isShortcutsHelpKey(questionMark(), false), true);
  assert.equal(isShortcutsHelpKey(questionMark({ tagName: "BUTTON" }), false), true);
  // Cmd+Shift+/ is the macOS Help menu.
  assert.equal(isShortcutsHelpKey(questionMark({ metaKey: true }), false), false);
  // The composer, the terminal's hidden textarea, a rename box, a select: the key types there.
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(isShortcutsHelpKey(questionMark({ tagName }), false), false, tagName);
  assert.equal(isShortcutsHelpKey(questionMark({ tagName: "DIV", isContentEditable: true }), false), false);
  assert.equal(isShortcutsHelpKey(questionMark(), true), false);
  assert.equal(isShortcutsHelpKey(questionMark({ defaultPrevented: true }), false), false);
  assert.equal(isShortcutsHelpKey(questionMark({ isComposing: true }), false), false);
  assert.equal(isShortcutsHelpKey({ ...questionMark(), key: "/" }, false), false);
});
