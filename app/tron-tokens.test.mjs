import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} rule`);
  return css.slice(start, css.indexOf("\n}", start));
}
const value = (rule, name) => rule.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("one palette: Tron surfaces and meaning colors", () => {
  assert.doesNotMatch(css, /\[data-theme=|html\.dark,\s*\n|html\.dark \{\n\s*color-scheme/);
  const root = block(":root");
  assert.equal(value(root, "--bg"), "#000000");
  assert.equal(value(root, "--bg-panel"), "#03080b");
  assert.equal(value(root, "--border"), "#0e3a4a");
  assert.equal(value(root, "--accent"), "#00d8ff");
  assert.equal(value(root, "color-scheme"), "dark");
  const theme = block("@theme static");
  for (const [name, hex] of [["--color-tron-cyan", "#00d8ff"], ["--color-tron-orange", "#ff9a00"], ["--color-tron-red", "#ff4d5e"], ["--color-tron-line", "#0e3a4a"], ["--color-tron-panel", "#03080b"]]) {
    assert.equal(value(theme, name), hex, name);
  }
  assert.match(value(theme, "--shadow-glow-cyan"), /^0 0 0 1px .*, 0 0 14px /);
});

test("text, muted and dim text stay readable on bg and panel", () => {
  const root = block(":root");
  for (const text of ["--text", "--text-muted", "--text-dim"]) {
    for (const surface of ["--bg", "--bg-panel"]) {
      const ratio = contrast(value(root, text), value(root, surface));
      assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
  }
});

test("fonts are self-hosted through next/font and wired to Tailwind", () => {
  assert.match(layout, /import \{ Geist, JetBrains_Mono, Orbitron \} from "next\/font\/google"/);
  for (const v of ["--font-geist", "--font-orbitron", "--font-jetbrains-mono"]) assert.match(layout, new RegExp(`variable: "${v}"`));
  const theme = block("@theme static");
  assert.match(value(theme, "--font-sans"), /^var\(--font-geist\)/);
  assert.match(value(theme, "--font-hud"), /^var\(--font-orbitron\)/);
  assert.match(value(theme, "--font-mono"), /^var\(--font-jetbrains-mono\)/);
  assert.doesNotMatch(css, /fonts\.googleapis/);
});

test("reduced motion stops every animation and transition", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s*\*,\n\s*\*::before,\n\s*\*::after \{[\s\S]*?animation-duration: 0\.01ms !important;[\s\S]*?transition-duration: 0\.01ms !important;/);
});
