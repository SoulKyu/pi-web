import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");

test("trust is read from the file for reopened sessions and written for new profile sessions", () => {
  assert.match(source, /agentProfileTrust\?: AgentProfileTrust/);
  assert.match(source, /const sessionTrust: AgentProfileTrust = newSessionProfile\s*\?\s*\(options\.agentProfileTrust \?\? "untrusted"\)\s*:\s*readSessionAgentTrust\(entries\)/);
  assert.match(source, /trust: sessionTrust,/);
});

test("only a trusted long-term thread re-snapshots from its profile; untrusted sessions keep their pinned snapshot", () => {
  assert.match(source, /readSessionAgentTrust\(entries\) === "trusted"\s*\?\s*resolveSubagentProfile\(sessionCwd, reopenedProfileName\)/);
  assert.match(source, /reopenedLongTermProfile\?\.longTerm \? reopenedLongTermProfile : undefined/);
  assert.match(source, /if \(!previous \|\| !sameResourceSnapshot\(previous, snapshotResources\)\) sessionManager\.appendCustomEntry\(AGENT_PROFILE_SESSION_TYPE, metadata\)/);
});

test("an isolated run narrows the active tools to the override before the snapshot is written", () => {
  assert.match(source, /if \(options\.agentProfileTools\) activeTools = activeTools\.filter\(\(tool\) => options\.agentProfileTools!\.includes\(tool\)\)/);
});

test("trusted threads suppress the completion push (D9)", () => {
  assert.match(source, /suppressCompletionNotifications: Boolean\(subagentResources\) && \(!isAgentProfileSession \|\| trustedThread\)/);
});

test("appendDisplayEntry appends a custom entry and emits custom_entry_appended; shutdownWhenIdle waits for the run", () => {
  assert.match(source, /appendDisplayEntry\(customType: string, data: unknown\): string/);
  assert.match(source, /this\.inner\.sessionManager\.appendCustomEntry\(customType, data\)/);
  assert.match(source, /type: "custom_entry_appended"/);
  assert.match(source, /shutdownWhenIdle\(\): void/);
  assert.match(source, /if \(this\.shutdownAfterRun && !this\.isRunning\(\)\)/);
});
