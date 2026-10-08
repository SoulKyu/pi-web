import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialog = await readFile(new URL("./NewAgentDialog.tsx", import.meta.url), "utf8");
const queue = await readFile(new URL("./QueueTaskDialog.tsx", import.meta.url), "utf8");
const models = await readFile(new URL("../ModelsConfig.tsx", import.meta.url), "utf8");

test("avatar colors are #rrggbb data the agent registry accepts, never CSS tokens", () => {
  const list = dialog.match(/export const COLORS = \[([^\]]*)\]/)?.[1] ?? "";
  const colors = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(colors.length >= 6);
  for (const color of colors) assert.match(color, /^#[0-9a-fA-F]{6}$/, color);
});

test("text on cyan buttons is dark (accent-contrast), not white", () => {
  assert.match(models, /color: savedOk \? "var\(--accent-contrast\)"/);
  assert.match(queue, /background: "var\(--accent\)", color: "var\(--accent-contrast\)"/);
});
