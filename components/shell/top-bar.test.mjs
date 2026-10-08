import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TopBarButton, contextTone } = await jiti.import("./TopBarButton.tsx");
const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");
const h = React.createElement;

test("TopBarButton is a typed button with CSS hover and an active trace", () => {
  const idle = renderToStaticMarkup(h(TopBarButton, { "aria-label": "History" }, "x"));
  assert.match(idle, /^<button[^>]*type="button"/);
  assert.match(idle, /hover:text-text/);
  assert.doesNotMatch(idle, /shadow-\[inset_0_-2px/);
  const active = renderToStaticMarkup(h(TopBarButton, { active: true, "aria-label": "Stats" }, "x"));
  assert.match(active, /shadow-\[inset_0_-2px_0_var\(--color-tron-cyan\)\]/);
  assert.match(renderToStaticMarkup(h(TopBarButton, { tone: "danger" }, "x")), /text-tron-red/);
});

test("contextTone: cyan, orange from 75, red from 90, cyan when unknown", () => {
  assert.equal(contextTone(null), "cyan");
  assert.equal(contextTone(74.9), "cyan");
  assert.equal(contextTone(75), "orange");
  assert.equal(contextTone(90), "red");
});

test("the top bar has no JS hover handlers and no off-palette colors", () => {
  const start = shell.indexOf("const renderProjectTrustWarning");
  const end = shell.indexOf("return (\n    <>\n    <style>");
  const toolbar = shell.slice(start, end);
  assert.doesNotMatch(toolbar, /onMouseEnter|onMouseLeave/);
  assert.doesNotMatch(shell, /#ef4444|#dc2626|#d97706|rgba\(234,179,8|rgba\(37,99,235/);
});

test("the desktop top bar shows the session title, a running badge and a context gauge", () => {
  assert.match(shell, /data-top-bar-title="true"/);
  assert.match(shell, /<Badge tone="orange"[^>]*>\s*<Led status="running"/);
  assert.match(shell, /<Gauge value=\{contextUsage\.percent\}/);
  // percent null keeps the "?" text and renders no gauge
  assert.match(shell, /contextUsage\?\.contextWindow && contextUsage\.percent !== null && \(\s*<Gauge/);
});

test("the desktop stats button can shrink so the file toggle stays on screen", () => {
  assert.match(shell, /className=\{cn\("min-w-0 shrink justify-end font-mono tabular-nums/);
});
