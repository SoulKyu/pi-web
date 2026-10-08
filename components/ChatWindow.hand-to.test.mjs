import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("a queued hand-over or review confirms the chosen target with a toast", () => {
  assert.match(chat, /onQueued=\{\(name\) => \{ addNotice\(\{ type: "success", message: t\("agents\.mention\.queued", \{ name \}\) \}\);/);
});
