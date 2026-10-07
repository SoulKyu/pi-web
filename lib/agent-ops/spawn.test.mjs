import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./spawn.ts", import.meta.url), "utf8");

test("a trigger run narrows the session to the allowlist, never trusted, and re-checks the pin against the global profile", () => {
  assert.match(source, /\.\.\.\(isTriggerRun \? \{ agentProfileTools: \[\.\.\.TRIGGER_TOOL_ALLOWLIST\] \} : \{\}\)/);
  assert.doesNotMatch(source, /agentProfileTrust/);
  assert.match(source, /resolveLongTermProfile\(profile\)/);
  assert.match(source, /await enforceTriggerTools\(session\)/);
});

test("the prompt is sent only after the caller's start check passes", () => {
  assert.match(source, /beforePrompt\?\.\(\);\n  const \{ done, abort \} = watchPromptRun/);
});
