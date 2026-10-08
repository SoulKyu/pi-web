import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { detectShortcutPlatform, formatShortcut } from "./shortcut-label.ts";

const jiti = createJiti(import.meta.url);
const chatInput = await readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");
const hook = await readFile(new URL("../hooks/useShortcutPlatform.ts", import.meta.url), "utf8");
const locales = await Promise.all(["en", "fr", "zh-CN", "zh-TW"].map(async (id) => Object.values(await jiti.import(`./i18n/messages/${id}.ts`)).find((value) => value?.messages)));

test("macOS, iPhone and iPad are mac; Windows, Linux, Android and unknown are other", () => {
  assert.equal(detectShortcutPlatform({ platform: "MacIntel" }), "mac");
  assert.equal(detectShortcutPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }), "mac");
  assert.equal(detectShortcutPlatform({ userAgent: "Mozilla/5.0 (iPad; CPU OS 16_2 like Mac OS X)" }), "mac");
  assert.equal(detectShortcutPlatform({ platform: "iPhone" }), "mac");
  assert.equal(detectShortcutPlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }), "other");
  assert.equal(detectShortcutPlatform({ platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }), "other");
  assert.equal(detectShortcutPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" }), "other");
  assert.equal(detectShortcutPlatform({}), "other");
  assert.equal(detectShortcutPlatform(undefined), "other");
});

test("mac chords use glyphs without a separator, others join names with +", () => {
  assert.equal(formatShortcut(["Ctrl", "Alt", "N"], "mac"), "⌃⌥N");
  assert.equal(formatShortcut(["Ctrl", "Alt", "N"], "other"), "Ctrl+Alt+N");
  assert.equal(formatShortcut(["Meta", "Shift", "K"], "mac"), "⌘⇧K");
  assert.equal(formatShortcut(["Alt", "Enter"], "mac"), "⌥Enter");
  assert.equal(formatShortcut(["Alt", "Enter"], "other"), "Alt+Enter");
  assert.equal(formatShortcut(["Alt", "ArrowUp"], "mac"), "⌥↑");
  assert.equal(formatShortcut(["Alt", "ArrowDown"], "other"), "Alt+↓");
  assert.equal(formatShortcut(["Esc"], "mac"), "Esc");
  assert.equal(formatShortcut(["Esc"], "other"), "Esc");
});

test("the platform hook is hydration-safe", () => {
  assert.match(hook, /useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/);
  assert.match(hook, /const getServerSnapshot = \(\): ShortcutPlatform => "other";/);
});

test("Stop shows Esc, New session shows Ctrl+Alt+N, the desktop follow-up button shows its chord", () => {
  assert.match(chatInput, /title=\{t\("chat\.stopAgent", \{ shortcut: formatShortcut\(\["Esc"\], shortcutPlatform\) \}\)\}\s*aria-keyshortcuts="Escape"/);
  assert.match(chatInput, /\{t\("chat\.followUp"\)\}\s*\{!isMobile && <kbd className="shortcut-kbd" aria-hidden="true">\{formatShortcut\(\["Alt", "Enter"\], shortcutPlatform\)\}<\/kbd>\}/);
  assert.match(sidebar, /t\("sidebar\.newSessionTitle", \{ path: selectedCwd, shortcut: formatShortcut\(\["Ctrl", "Alt", "N"\], shortcutPlatform\) \}\)/);
  assert.match(sidebar, /aria-keyshortcuts="Control\+Alt\+N"/);
});

test("the hint keys carry {shortcut} in the four locales", () => {
  for (const locale of locales) {
    assert.match(locale.messages["chat.stopAgent"], /\{shortcut\}/, locale.id);
    assert.match(locale.messages["sidebar.newSessionTitle"], /\{path\}[\s\S]*\{shortcut\}/, locale.id);
  }
});
