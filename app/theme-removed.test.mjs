import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the root layout is always dark and runs no theme script", () => {
  assert.match(layout, /<html[^>]*className=\{`[^`]*\bdark\b[^`]*`\}/);
  assert.doesNotMatch(layout, /THEME_INIT_SCRIPT|dangerouslySetInnerHTML/);
});

test("no theme module or stored theme preference remains", async () => {
  for (const path of ["../lib/theme.ts", "../hooks/useTheme.ts", "../components/ThemeIcon.tsx"]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  }
  for (const path of ["../components/AppShell.tsx", "../components/SettingsPanel.tsx", "../components/MermaidBlock.tsx", "../components/FileViewer.tsx"]) {
    const source = await read(path);
    assert.doesNotMatch(source, /useTheme|pi-theme|THEME_OPTIONS/, path);
  }
});
