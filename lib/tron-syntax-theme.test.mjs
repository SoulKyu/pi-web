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
  assert.equal(tronSyntaxTheme.string.color, "#7fe9ff");
  assert.equal(tronSyntaxTheme.function.color, "#5ce6ff");
  assert.equal(tronSyntaxTheme.number.color, "#ffbf66");
  assert.equal(tronSyntaxTheme.comment.color, "#5b8a9a");
  assert.equal(tronSyntaxTheme.deleted.color, "#ff4d5e");
  assert.equal(tronSyntaxTheme.inserted.color, "#2ef2b0");
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
  assert.match(mermaid, /primaryBorderColor: "#00d8ff"/);
});
