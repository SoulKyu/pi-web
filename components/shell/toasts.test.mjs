import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../agents/AgentProfileDialog.tsx", import.meta.url), "utf8");

test("agent flows use toasts, never blocking alerts", () => {
  assert.doesNotMatch(shell, /window\.alert\(/);
  assert.doesNotMatch(profile, /window\.alert\(/);
  assert.match(shell, /toast\.error\(translate\("agents\.profile\.running"\)\);\s*return;/);
});

test("the Toaster is mounted once, dark, with Tron classes", () => {
  assert.equal((shell.match(/<Toaster\b/g) ?? []).length, 1);
  assert.match(shell, /<Toaster[^>]*theme="dark"/);
  assert.match(shell, /toast: "[^"]*border-tron-line/);
});

test("security-relevant quarantine warnings stay until dismissed", () => {
  assert.match(profile, /toast\.warning\(t\("agents\.profile\.quarantineVault"[\s\S]*?\{ duration: Infinity, closeButton: true \}\)/);
  assert.match(profile, /toast\.warning\(t\("agents\.profile\.quarantinePartial"[\s\S]*?\{ duration: Infinity, closeButton: true \}\)/);
});
