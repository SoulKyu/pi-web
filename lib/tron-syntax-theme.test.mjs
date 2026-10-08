import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { tronSyntaxTheme } = await jiti.import("./tron-syntax-theme.ts");
const viewer = await readFile(new URL("../components/FileViewer.tsx", import.meta.url), "utf8");
const mermaid = await readFile(new URL("../components/MermaidBlock.tsx", import.meta.url), "utf8");

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onBlack = (hex) => (luminance(hex) + 0.05) / 0.05;

test("token colors follow the Tron code palette", () => {
  assert.equal(tronSyntaxTheme.keyword.color, "#ff9a00");
  assert.equal(tronSyntaxTheme.string.color, "#7dffd0");
  assert.equal(tronSyntaxTheme.function.color, "#5ce6ff");
  assert.equal(tronSyntaxTheme.number.color, "#ffbf66");
  assert.equal(tronSyntaxTheme.comment.color, "#5b8a9a");
  assert.equal(tronSyntaxTheme.deleted.color, "#ff4d5e");
  assert.equal(tronSyntaxTheme.inserted.color, "#00d8ff"); // same as the app diff (--diff-added)
  assert.equal(tronSyntaxTheme['pre[class*="language-"]'].color, "#dff6ff");
});

test("every token color stays readable on black (comments included)", () => {
  for (const [key, style] of Object.entries(tronSyntaxTheme)) {
    if (typeof style?.color === "string" && style.color.startsWith("#")) {
      assert.ok(onBlack(style.color) >= 4.5, `${key} ${style.color} ${onBlack(style.color).toFixed(2)}:1`);
    }
  }
});

test("the viewer and chat code blocks share it; Mermaid uses a Tron base theme", () => {
  assert.match(viewer, /style=\{tronSyntaxTheme\}/);
  assert.match(mermaid, /\.\.\.tronSyntaxTheme,/);
  assert.match(mermaid, /theme: "base",/);
  assert.match(mermaid, /themeVariables: TRON_MERMAID_THEME_VARIABLES/);
});

function lab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

test("strings, functions, properties and plain text are clearly different hues (ΔE ≥ 15)", () => {
  const roles = {
    string: tronSyntaxTheme.string.color,
    function: tronSyntaxTheme.function.color,
    property: tronSyntaxTheme.property.color,
    text: tronSyntaxTheme['pre[class*="language-"]'].color,
  };
  const names = Object.keys(roles);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const d = deltaE(roles[names[i]], roles[names[j]]);
    assert.ok(d >= 15, `${names[i]} vs ${names[j]}: ΔE ${d.toFixed(1)}`);
  }
});
