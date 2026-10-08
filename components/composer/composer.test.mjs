import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ComposerChip } = await jiti.import("./ComposerChip.tsx");
const input = await readFile(new URL("../ChatInput.tsx", import.meta.url), "utf8");
const h = React.createElement;

test("ComposerChip: typed button, hover only when enabled, danger and active tones", () => {
  const idle = renderToStaticMarkup(h(ComposerChip, null, "x"));
  assert.match(idle, /^<button[^>]*type="button"/);
  assert.match(idle, /enabled:hover:text-text/);
  assert.doesNotMatch(idle, /(^|\s|")hover:/);
  assert.match(renderToStaticMarkup(h(ComposerChip, { tone: "danger" }, "x")), /text-tron-red/);
  assert.match(renderToStaticMarkup(h(ComposerChip, { active: true }, "x")), /bg-bg-hover/);
});

test("the control bar has no JS hover handlers", () => {
  const start = input.indexOf("{/* Bottom bar: left | center (context) | right */}");
  const bar = input.slice(start, input.indexOf("</fieldset>", start));
  assert.doesNotMatch(bar, /onMouseEnter|onMouseLeave/);
  assert.match(bar, /<ComposerChip/);
});

test("composer menus share the Tron menu class", () => {
  assert.ok((input.match(/composerMenuClass/g) ?? []).length >= 5, "import + thinking, tools, history, mobile panel");
});
