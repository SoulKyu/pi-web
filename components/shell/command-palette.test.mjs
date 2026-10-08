import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isCommandPaletteKey } from "../../hooks/useKeyboardShortcuts.ts";

const palette = await readFile(new URL("./CommandPalette.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");

function key(k, { metaKey = false, ctrlKey = false, altKey = false, shiftKey = false, isComposing = false, defaultPrevented = false, inTerminal = false } = {}) {
  return { key: k, metaKey, ctrlKey, altKey, shiftKey, isComposing, defaultPrevented, target: { closest: (sel) => (inTerminal && sel === ".terminal-xterm" ? {} : null) } };
}

test("Cmd+K on mac, Ctrl+K elsewhere; never with Alt/Shift, while composing, or when taken", () => {
  assert.equal(isCommandPaletteKey(key("k", { metaKey: true }), "mac"), true);
  assert.equal(isCommandPaletteKey(key("K", { metaKey: true }), "mac"), true);
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true }), "mac"), false);
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true }), "other"), true);
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true, altKey: true }), "other"), false);
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true, shiftKey: true }), "other"), false);
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true, isComposing: true }), "other"), false);
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true, defaultPrevented: true }), "other"), false);
});

test("Ctrl+K inside the terminal stays with the shell", () => {
  assert.equal(isCommandPaletteKey(key("k", { ctrlKey: true, inTerminal: true }), "other"), false);
});

test("items honor disabled and close the palette before running", () => {
  assert.match(palette, /disabled=\{command\.disabled\}/);
  assert.match(palette, /onSelect=\{\(\) => \{\s*onOpenChange\(false\);\s*command\.run\(\);/);
});

test("AppShell wires the palette: key, settings disabled without a project, render", () => {
  assert.match(shell, /isCommandPaletteKey\(event, shortcutPlatform\)/);
  assert.match(shell, /disabled: settingsSectionRequiresProject\(section\) && !projectTrustCwd/);
  assert.match(shell, /<CommandPalette/);
});

test("every locale has the palette strings", async () => {
  const keys = ["palette.title", "palette.placeholder", "palette.empty", "palette.groupActions", "palette.groupSettings", "palette.groupSessions", "palette.newSession", "palette.toggleSidebar", "palette.toggleFiles"];
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const src = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const k of keys) assert.ok(src.includes(`"${k}"`), `${locale} ${k}`);
  }
});
