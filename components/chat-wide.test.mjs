import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("with the sidebar or the file panel collapsed, the chat column uses the full width", () => {
  assert.match(shell, /data-chat-wide=\{!sidebarOpen \|\| !rightPanelOpen \? "true" : undefined\}/);
  // Overrides the root value (the Settings width) only inside the chat column.
  assert.match(css, /\[data-chat-wide="true"\] \{\s*--chat-content-max-width: 100%;/);
});
