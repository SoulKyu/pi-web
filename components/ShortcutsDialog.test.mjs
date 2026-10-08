import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialog = await readFile(new URL("./ShortcutsDialog.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const hook = await readFile(new URL("../hooks/useKeyboardShortcuts.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the dialog is modal, above Settings, traps Tab, and Escape closes it alone", () => {
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /openStackedDialog\(document, panelRef\.current, \(\) => onCloseRef\.current\(\)\)/);
  assert.match(dialog, /if \(event\.key !== "Tab"\) return;\s*event\.preventDefault\(\);/);
  assert.match(dialog, /zIndex: 1100/);
  assert.match(dialog, /shortcutGroups\(sendMode, isMobile, detectShortcutPlatform\(navigator\)\)/);
  assert.match(css, /\.shortcuts-dialog:focus-visible \{/);
  assert.doesNotMatch(dialog, /\(\?<[=!]/);
});

test("?, Settings › General and the mobile toolbar open it", () => {
  assert.match(hook, /if \(onShowShortcuts && isShortcutsHelpKey\(e, document\.querySelector\('\[role="dialog"\]'\) !== null\)\) \{/);
  assert.match(shell, /useGlobalKeyboardShortcuts\(\{[\s\S]*?onShowShortcuts: openShortcuts,/);
  assert.match(shell, /\{shortcutsOpen && <ShortcutsDialog onClose=\{\(\) => \{\s*setShortcutsOpen\(false\);/);
  assert.match(shell, /onShowShortcuts=\{openShortcuts\}/);
  assert.match(shell, /data-mobile-toolbar-action="shortcuts"/);
  assert.match(settings, /onClick=\{onShowShortcuts\}/);
});
