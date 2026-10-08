import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const messageView = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");
const fileViewer = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");

/** The declarations of the first `selector {` rule in a stylesheet. */
function cssRule(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} has a rule`);
  return css.slice(start, css.indexOf("}", start));
}

function declared(rule, name) {
  const match = rule.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `${name} is declared`);
  return match[1].trim();
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = [":root"];

test("every theme defines the four diff variables, backgrounds mixed from the marker colour", () => {
  for (const theme of THEMES) {
    const rule = cssRule(theme);
    assert.match(declared(rule, "--diff-added"), /^#[0-9a-f]{6}$/i, theme);
    assert.match(declared(rule, "--diff-removed"), /^#[0-9a-f]{6}$/i, theme);
    assert.equal(declared(rule, "--diff-added-bg"), "color-mix(in srgb, var(--diff-added) 14%, transparent)", theme);
    assert.equal(declared(rule, "--diff-removed-bg"), "color-mix(in srgb, var(--diff-removed) 14%, transparent)", theme);
  }
});

test("diff markers reach 3:1 against their theme's background", () => {
  for (const theme of THEMES) {
    const rule = cssRule(theme);
    const bg = declared(rule, "--bg");
    for (const name of ["--diff-added", "--diff-removed"]) {
      const ratio = contrast(declared(rule, name), bg);
      assert.ok(ratio >= 3, `${theme} ${name} ${ratio.toFixed(2)}:1`);
    }
  }
});

const HARDCODED_DIFF = /#22c55e|#4ade80|#f87171|rgba\(34,197,94|rgba\(248,113,113|rgba\(0,200,80|rgba\(240,60,60/;

function between(source, from, to) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, to);
  return source.slice(start, end);
}

test("the three diff renderers use the palette variables, no literal greens or reds", () => {
  const split = between(messageView, "function SplitDiffCellView(", "function PatchTextView(");
  const patch = between(messageView, "function PatchTextView(", "\nfunction ");
  const fileDiff = between(fileViewer, "function DiffView(", "\nfunction ");
  for (const [name, body] of [["SplitDiffCellView", split], ["PatchTextView", patch], ["DiffView", fileDiff]]) {
    assert.doesNotMatch(body, HARDCODED_DIFF, name);
    assert.match(body, /var\(--diff-added\)/, name);
    assert.match(body, /var\(--diff-removed\)/, name);
    assert.match(body, /var\(--diff-added-bg\)/, name);
    assert.match(body, /var\(--diff-removed-bg\)/, name);
  }
});
