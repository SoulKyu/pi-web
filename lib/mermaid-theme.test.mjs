import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TRON_MERMAID_THEME_VARIABLES as vars } from "./mermaid-theme.ts";

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test("pie and section color series are explicit and visible on black", () => {
  for (let i = 1; i <= 12; i++) assert.ok(luminance(vars[`pie${i}`]) > 0.15, `pie${i} ${vars[`pie${i}`]}`);
  for (let i = 0; i <= 11; i++) {
    assert.ok(luminance(vars[`cScale${i}`]) > 0.15, `cScale${i} ${vars[`cScale${i}`]}`);
    assert.equal(vars[`cScaleLabel${i}`], "#000000");
  }
  for (let i = 0; i <= 7; i++) assert.equal(vars[`gitBranchLabel${i}`], "#dff6ff");
  assert.notEqual(vars.pieStrokeColor, "black");
});

test("MermaidBlock uses the shared Tron variables with the base theme", async () => {
  const block = await readFile(new URL("../components/MermaidBlock.tsx", import.meta.url), "utf8");
  assert.match(block, /theme: "base",\s*themeVariables: TRON_MERMAID_THEME_VARIABLES,/);
});
