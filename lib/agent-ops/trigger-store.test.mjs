import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { checkActiveTriggerTools, profilePinSha256 } = await (await import("jiti")).createJiti(import.meta.url).import("./trigger-store.ts");

test("checkActiveTriggerTools refuses subagent/bash, accepts read + memory_search", () => {
  assert.match(checkActiveTriggerTools(["read", "subagent"]), /outside the allowlist: subagent/);
  assert.match(checkActiveTriggerTools(["bash"]), /outside the allowlist: bash/);
  assert.equal(checkActiveTriggerTools(["read", "memory_search"]), null);
});

test("profilePinSha256 hashes the file bytes for file-backed profiles", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "agentops-pin-")), "p.md");
  writeFileSync(filePath, "one");
  const first = profilePinSha256({ filePath });
  assert.equal(profilePinSha256({ filePath }), first);
  writeFileSync(filePath, "two");
  assert.notEqual(profilePinSha256({ filePath }), first);
});

test("profilePinSha256 hashes the snapshot of built-in profiles", () => {
  const builtIn = { systemPrompt: "a", tools: ["read"], loadSkills: false, loadExtensions: false };
  assert.equal(profilePinSha256({ ...builtIn }), profilePinSha256({ ...builtIn }));
  assert.notEqual(profilePinSha256({ ...builtIn, systemPrompt: "b" }), profilePinSha256(builtIn));
});
