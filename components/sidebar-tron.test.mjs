import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tron look of the redesigned upstream sidebar: upstream structure, Tron appearance
// (docs/superpowers/specs/2026-10-08-tron-ui-design.md). Replaces session-sidebar-tron.test.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const layout = await read("../app/layout.tsx");
const tron = await read("../app/sidebar-tron.css");
const css = { sidebar: await read("../app/sidebar.css"), menu: await read("../app/sidebar-menu.css"), tron };
const tree = await read("./SessionTree.tsx");
const sources = {
  tree,
  menu: await read("./SidebarMenu.tsx"),
  toast: await read("./SidebarToast.tsx"),
  picker: await read("./ProjectWorktreePicker.tsx"),
  bar: await read("./NewSessionContextBar.tsx"),
  worktree: await read("./WorktreeCreateForm.tsx"),
  fonts: await read("./FontSettings.tsx"),
};
// Only black, white and the Tron hues (cyan 0 216 255, orange 255 154 0, red 255 77 94) as literals.
const OFF_PALETTE = /#(?!(?:000|000000|fff|ffffff)\b)[0-9a-f]{3,8}\b|rgba?\(\s*(?!0[\s,]+0[\s,]+0\b|0 216 255\b|255 154 0\b|255 77 94\b)\d/i;
const rule = (text, selector) => {
  const start = text.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return text.slice(start, text.indexOf("\n}", start));
};

test("the Tron sheet loads after the upstream sidebar styles", () => {
  assert.match(layout, /import "\.\/sidebar\.css";\nimport "\.\/sidebar-menu\.css";\nimport "\.\/sidebar-tron\.css";/);
});

test("no off-palette colors in the sidebar styles and components", () => {
  for (const [name, text] of Object.entries({ ...css, ...sources })) {
    const match = text.replace(/\/\*[\s\S]*?\*\//g, "").match(OFF_PALETTE);
    assert.equal(match, null, `${name}: ${match?.[0]}`);
  }
});

test("sidebar corners are square (circles and pills excepted)", () => {
  for (const [name, text] of Object.entries(css)) {
    for (const match of text.matchAll(/border-radius:\s*([^;]+);/g)) {
      assert.ok(/^(0|50%|999px|9999px)$/.test(match[1].trim()), `${name}: border-radius: ${match[1]}`);
    }
  }
});

test("the selected session carries the orange trace; a row in delete-confirm is red instead", () => {
  const selected = rule(tron, ".session-tree-session.is-selected:not(.is-confirming)");
  assert.match(selected, /box-shadow: inset 2px 0 0 var\(--color-tron-orange\)/);
  assert.match(selected, /background: linear-gradient\(90deg, rgb\(255 154 0 \/ 0\.12\), transparent\)/);
  assert.match(rule(tron, ".session-tree-session.is-confirming"), /box-shadow: inset 2px 0 0 var\(--color-tron-red\)/);
});

test("running work is an orange LED with its accessible label; unread stays a cyan dot", () => {
  assert.match(tree, /meta = <Led status="running" label=\{t\("sidebar\.agentRunning"\)\} \/>;/);
  assert.match(tree, /className="session-tree-summary-running"[\s\S]*?<Led status="running" \/>/);
  assert.doesNotMatch(tree, /SpinnerIcon/);
  assert.match(rule(tron, ".session-tree-unread,\n.session-tree-summary-dot,\n.session-tree-pinned-dot.is-unread"), /box-shadow: 0 0 8px var\(--color-tron-cyan\)/);
  assert.match(rule(tron, ".session-tree-pinned-dot.is-running"), /background: var\(--color-tron-orange\)/);
});

test("tabs and section headers are HUD labels; focus is a cyan glow", () => {
  assert.match(rule(tron, ".sidebar-tab-label,\n.session-tree-pinned-label,\n.sidebar-menu-header,\n.sidebar-sheet-title"), /font-family: var\(--font-hud\);[\s\S]*text-transform: uppercase;/);
  assert.match(tron, /\.session-tree button:focus-visible,[\s\S]*?\{\s*outline: 1px solid var\(--color-tron-cyan\);\s*outline-offset: -1px;\s*box-shadow: var\(--shadow-glow-cyan\);/);
});

test("menus, the phone sheet and the toast are glowing Tron panels", () => {
  assert.match(rule(tron, ".sidebar-menu,\n.sidebar-toast"), /background: var\(--color-tron-panel\);\s*box-shadow: var\(--shadow-glow-cyan\);/);
  assert.match(rule(tron, ".sidebar-sheet"), /background: var\(--color-tron-panel\)/);
});

test("fields glow only while focused, in the sidebar and in Settings › Fonts", async () => {
  assert.match(tron, /\/\* Fields: hairline, cyan glow while typing\. \*\/\n\.session-tree-rename:focus,\n\.sidebar-worktree-input:focus,\n\.sidebar-search-input:focus,\n\.sidebar-menu-filter-input:focus \{/);
  const settings = await read("../app/settings.css");
  assert.match(rule(settings, ".settings-font-input:focus-visible"), /outline: 1px solid var\(--color-tron-cyan\);\s*outline-offset: -1px;\s*box-shadow: var\(--shadow-glow-cyan\);/);
});
