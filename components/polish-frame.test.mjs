import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TopBarButton } = await jiti.import("./shell/TopBarButton.tsx");
const { HexAvatar } = await jiti.import("./tron/index.tsx");
const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const shell = await read("./AppShell.tsx");
const sidebar = await read("./SessionSidebar.tsx");
const h = React.createElement;

test("disabled top-bar buttons do not react to hover; focus keeps the active trace", () => {
  const out = renderToStaticMarkup(h(TopBarButton, { active: true }, "x"));
  assert.doesNotMatch(out, /(\s|")hover:/);
  assert.match(out, /enabled:hover:bg-bg-hover/);
  assert.match(out, /focus-visible:shadow-\[inset_0_-2px_0_var\(--color-tron-cyan\),var\(--shadow-glow-cyan\)\]/);
  assert.doesNotMatch(sidebar, /"hover:bg-bg-hover hover:!text-text-muted/);
});

test("stats icons keep their intended size", () => {
  assert.match(shell, /\[&_svg\]:size-2\.5!/);
  assert.match(shell, /\[&_svg\]:size-3!/);
});

test("the agent color tints the inside of the hex", () => {
  assert.match(renderToStaticMarkup(h(HexAvatar, { label: "ops", color: "#7c3aed" })), /background:color-mix\(in srgb, #7c3aed 30%, #000\)/);
});
