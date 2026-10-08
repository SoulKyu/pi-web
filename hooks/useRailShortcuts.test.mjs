import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useRailShortcuts.ts", import.meta.url), "utf8");
const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");

test("the rail shortcuts skip dialogs, prevent default only when handled, and run from the composer", () => {
  assert.match(source, /document\.querySelector\('\[role="dialog"\]'\)/);
  assert.match(source, /if \(!target\) return;\s+e\.preventDefault\(\);/);
  assert.doesNotMatch(source, /TEXTAREA|INPUT/);
  assert.doesNotMatch(source, /\(\?<[=!]/);
});

test("AppShell mounts them with the rail's agents and openAgent", () => {
  assert.match(shell, /useRailShortcuts\(agents, activeAgent, [^)]*openAgent/);
});
