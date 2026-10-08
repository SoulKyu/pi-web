import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const chat = await read("./ChatWindow.tsx");
const branches = await read("./BranchNavigator.tsx");
const minimap = await read("./ChatMinimap.tsx");
const css = await read("../app/globals.css");

test("the perspective grid sits behind the scrolling messages", () => {
  assert.match(chat, /<PerspectiveGrid className="z-0 opacity-50" \/>/);
  assert.match(chat, /className="scrollbar-subtle relative z-\[1\] min-w-0 flex-1/);
});

test("no off-palette colors remain around the chat", () => {
  for (const [name, source] of [["ChatWindow", chat], ["BranchNavigator", branches], ["ChatMinimap", minimap]]) {
    assert.doesNotMatch(source, /#ef4444|#dc2626|#d97706|#10b981|rgba\((37,99,235|128,128,128)/, name);
  }
});

test("code block headers are HUD labels", () => {
  const rule = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf("}", i)); };
  assert.match(rule(".markdown-code-lang"), /font-family: var\(--font-hud\)/);
  assert.match(rule(".markdown-code-lang"), /text-transform: uppercase/);
  assert.doesNotMatch(rule(".markdown-code-block"), /border-radius: [1-9]/);
});
