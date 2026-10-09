import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settings = await readFile(new URL("./settings.css", import.meta.url), "utf8");
const globals = await readFile(new URL("./globals.css", import.meta.url), "utf8");
const dialogStyles = await readFile(new URL("../components/agents/dialog-styles.ts", import.meta.url), "utf8");
const OFF_PALETTE = /#(ef4444|dc2626|f85149|e5484d|f87171|16a34a|22c55e|4ade80|10b981|3fb950|2563eb|3b82f6|6366f1|d97706|ca8a04|eab308|f59e0b)\b|rgba\(\s*(239,\s*68,\s*68|34,\s*197,\s*94|16,\s*185,\s*129|99,\s*102,\s*241|129,\s*140,\s*248|37,\s*99,\s*235|234,\s*179,\s*8|217,\s*119,\s*6)/i;

const rule = (css, sel) => {
  const start = css.indexOf(`\n${sel} {`);
  assert.ok(start >= 0, sel);
  return css.slice(start, css.indexOf("\n}", start));
};

test("no off-palette colors in the shared settings, global and dialog styles", () => {
  assert.doesNotMatch(settings, OFF_PALETTE);
  assert.doesNotMatch(globals, OFF_PALETTE);
  assert.doesNotMatch(dialogStyles, OFF_PALETTE);
});

test("settings corners are square (circles excepted)", () => {
  for (const match of settings.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.ok(/^(0|50%|999px|9999px)$/.test(match[1].trim()), `border-radius: ${match[1]}`);
  }
});

test("the Settings dialog and the agent dialogs glow on a hairline", () => {
  const surface = rule(settings, ".settings-dialog-surface");
  assert.match(surface, /border: 1px solid var\(--color-tron-line\)/);
  assert.match(surface, /box-shadow: var\(--shadow-glow-cyan\)/);
  assert.match(dialogStyles, /boxShadow: "var\(--shadow-glow-cyan\)"/);
  assert.match(dialogStyles, /border: "1px solid var\(--color-tron-line\)"/);
});

test("settings headings are HUD labels; the active section has a cyan trace", () => {
  assert.match(rule(settings, ".settings-general-heading"), /font-family: var\(--font-hud\)/);
  assert.match(rule(settings, '.config-sidebar-item[aria-current="page"]'), /box-shadow: inset 2px 0 0 var\(--color-tron-cyan\)/);
});

// Settings › Fonts (upstream #1074): empty fields fall back to the Tron fonts, and say so.
test("font defaults are the Tron fonts, and the font placeholders name them", async () => {
  assert.match(globals, /--font-ui-default: var\(--font-geist\),/);
  assert.match(globals, /--font-mono-default: var\(--font-jetbrains-mono\),/);
  for (const id of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../lib/i18n/messages/${id}.ts`, import.meta.url), "utf8");
    assert.match(messages, /"settings\.uiFontPlaceholder": "[^"]*Geist"/, id);
    assert.match(messages, /"settings\.monoFontPlaceholder": "[^"]*JetBrains Mono"/, id);
  }
});
