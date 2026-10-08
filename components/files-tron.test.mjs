import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const explorer = await read("./FileExplorer.tsx");
const viewer = await read("./FileViewer.tsx");
const tabs = await read("./TabBar.tsx");
const css = await read("../app/globals.css");
const OFF = /#(d6a84b|facc15|f59e0b|22c55e|4ade80|f87171|ef4444|3b82f6|60a5fa)\b/i;

test("no off-palette colors in the file panel and the terminal status dot", () => {
  for (const [name, source] of [["FileExplorer", explorer], ["FileViewer", viewer], ["TabBar", tabs]]) {
    assert.doesNotMatch(source, OFF, name);
  }
  const dot = css.slice(css.indexOf("\n.terminal-status-dot {"), css.indexOf("}", css.indexOf("\n.terminal-status-dot {")));
  assert.doesNotMatch(dot, OFF);
});

test("git status colors keep their meaning", () => {
  assert.match(explorer, /modified: "var\(--color-tron-orange\)"/);
  assert.match(explorer, /added: "var\(--color-tron-cyan\)"/);
  assert.match(explorer, /deleted: "var\(--color-tron-red\)"/);
  assert.match(explorer, /conflict: "var\(--color-tron-red\)"/);
});

test("the active tab has the cyan trace; hover is CSS", () => {
  assert.match(tabs, /shadow-\[inset_0_-2px_0_var\(--color-tron-cyan\)\]/);
  assert.doesNotMatch(tabs, /onMouseEnter|hoveredClose/);
});
