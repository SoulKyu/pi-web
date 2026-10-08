import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { shortcutGroups } = await jiti.import("./shortcuts-table.ts");
const { enLocale } = await jiti.import("../lib/i18n/messages/en.ts");
const { frLocale } = await jiti.import("../lib/i18n/messages/fr.ts");
const { zhCNLocale } = await jiti.import("../lib/i18n/messages/zh-CN.ts");
const { zhTWLocale } = await jiti.import("../lib/i18n/messages/zh-TW.ts");

const keysOf = (groups) => Object.fromEntries(groups.flatMap((group) => group.rows.map((row) => [row.labelKey, row.keys])));

test("other platforms spell chords with +, and Enter sends in the default mode", () => {
  assert.deepEqual(keysOf(shortcutGroups("enter", false, "other")), {
    "shortcuts.stopAgent": "Esc",
    "shortcuts.newSession": "Ctrl+Alt+N",
    "shortcuts.showHelp": "?",
    "shortcuts.commandPalette": "Ctrl+K",
    "shortcuts.unreadAgent": "Alt+↓ / Alt+↑",
    "shortcuts.nthAgent": "Ctrl+Alt+1–9",
    "shortcuts.send": "Enter",
    "shortcuts.followUp": "Alt+Enter",
    "shortcuts.switchTab": "← / → · Home / End",
  });
});

test("macOS uses the modifier symbols", () => {
  const keys = keysOf(shortcutGroups("enter", false, "mac"));
  assert.equal(keys["shortcuts.newSession"], "⌃⌥N");
  assert.equal(keys["shortcuts.unreadAgent"], "⌥↓ / ⌥↑");
  assert.equal(keys["shortcuts.nthAgent"], "⌃⌥1–9");
  assert.equal(keys["shortcuts.send"], "Enter");
  assert.equal(keys["shortcuts.followUp"], "⌥Enter");
});

test("the Ctrl/Cmd+Enter mode and phones send with the modifier, Cmd on macOS, as ChatInput does", () => {
  const ctrlOther = keysOf(shortcutGroups("ctrlEnter", false, "other"));
  assert.equal(ctrlOther["shortcuts.send"], "Ctrl+Enter");
  assert.equal(ctrlOther["shortcuts.followUp"], "Ctrl+Alt+Enter");
  const ctrlMac = keysOf(shortcutGroups("ctrlEnter", false, "mac"));
  assert.equal(ctrlMac["shortcuts.send"], "⌘Enter");
  assert.equal(ctrlMac["shortcuts.followUp"], "⌥⌘Enter");
  const phone = keysOf(shortcutGroups("enter", true, "other"));
  assert.equal(phone["shortcuts.send"], "Ctrl+Enter");
  assert.equal(phone["shortcuts.followUp"], "Ctrl+Alt+Enter");
});

test("four groups, no row for @ or / syntax, every key present in all four locales", () => {
  const groups = shortcutGroups("enter", false, "other");
  assert.deepEqual(groups.map((group) => group.titleKey), ["shortcuts.group.global", "shortcuts.group.agents", "shortcuts.group.composer", "shortcuts.group.fileTabs"]);
  const rows = groups.flatMap((group) => group.rows);
  assert.ok(rows.every((row) => !row.keys.startsWith("@") && !row.keys.startsWith("/")));
  const keys = [...groups.map((group) => group.titleKey), ...rows.map((row) => row.labelKey), "shortcuts.title", "shortcuts.open"];
  for (const locale of [enLocale, frLocale, zhCNLocale, zhTWLocale]) {
    for (const key of keys) assert.equal(typeof locale.messages[key], "string", `${locale.id} ${key}`);
  }
});

test("polish: the command palette shortcut is listed", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("./shortcuts-table.ts", import.meta.url), "utf8");
  assert.match(src, /\{ keys: chord\(platform === "mac" \? "Meta" : "Ctrl", "K"\), labelKey: "shortcuts\.commandPalette" \}/);
});
