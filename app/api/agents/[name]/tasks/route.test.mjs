import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("a hand-over is validated against the registry and its quote is fenced server-side", () => {
  assert.match(source, /requestedBy !== undefined && requestedBy !== "user"/);
  assert.match(source, /getLongTermAgent\(deliverTo\)/);
  assert.match(source, /deliverTo === agent\.name/);
  assert.match(source, /cannot deliver to the task's own agent/);
  assert.match(source, /QUOTE_MAX = 8000/);
  assert.match(source, /fenceExternal\(quote, "handoff"\)/);
  assert.match(source, /Context handed over by the user from agent \$\{deliverTo\}'s thread:/);
  assert.match(source, /requestedBy[^\n]*deliverTo/);
});
