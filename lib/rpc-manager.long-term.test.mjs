import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
const agentProfileSource = await readFile(new URL("./agent-profile-extensions.ts", import.meta.url), "utf8");

test("trust is read from the file for reopened sessions and written for new profile sessions", () => {
  assert.match(source, /agentProfileTrust\?: AgentProfileTrust/);
  assert.match(source, /const sessionTrust: AgentProfileTrust = newSessionProfile\s*\?\s*\(options\.agentProfileTrust \?\? "untrusted"\)\s*:\s*readSessionAgentTrust\(entries\)/);
  assert.match(source, /trust: sessionTrust,/);
});

test("only a trusted long-term thread re-snapshots from its profile; untrusted sessions keep their pinned snapshot", () => {
  assert.match(source, /readSessionAgentTrust\(entries\) === "trusted"\s*\?\s*resolveLongTermProfile\(reopenedProfileName\)/);
  assert.match(source, /reopenedLongTermProfile\?\.longTerm \? reopenedLongTermProfile : undefined/);
  assert.match(source, /if \(!previous \|\| !sameResourceSnapshot\(previous, snapshotResources\) \|\| JSON\.stringify\(readSessionMemoryPolicy\(entries\)\) !== JSON\.stringify\(memoryPolicy\)\) sessionManager\.appendCustomEntry\(AGENT_PROFILE_SESSION_TYPE, metadata\)/);
  assert.match(source, /\.\.\.\(memoryPolicy \? \{ memory: memoryPolicy \} : \{\}\)/);
});

test("an isolated run narrows the active tools to the override before the snapshot is written", () => {
  assert.match(source, /if \(newSessionProfile && options\.agentProfileTools\) activeTools = activeTools\.filter\(\(tool\) => options\.agentProfileTools!\.includes\(tool\)\)/);
});

test("a reopened trusted thread without its enabled long-term profile is refused", () => {
  assert.match(source, /profile is missing or disabled/);
  assert.match(source, /trustedThread: Boolean\(trustedThread && snapshotProfile\)/);
});

test("trusted threads suppress the completion push (D9)", () => {
  assert.match(source, /suppressCompletionNotifications: Boolean\(subagentResources\) \|\| isAgentProfileSession/);
});

test("appendDisplayEntry appends a custom entry and emits custom_entry_appended; shutdownWhenIdle waits for the run", () => {
  assert.match(source, /appendDisplayEntry\(customType: string, data: unknown\): string/);
  assert.match(source, /this\.inner\.sessionManager\.appendCustomEntry\(customType, data\)/);
  assert.match(source, /type: "custom_entry_appended"/);
  assert.match(source, /shutdownWhenIdle\(\): void/);
  assert.match(source, /persistSessionFile\(\): void/);
  assert.match(source, /if \(this\.shutdownAfterRun && !this\.isRunning\(\)\)/);
});

test("isRpcSessionStarting exposes the in-flight start locks", () => {
  assert.match(source, /isRpcSessionStarting\(sessionId: string\): boolean/);
});

test("trusted threads resolve the global long-term profile in its home; long-term profiles start only in their thread or an isolated run", () => {
  assert.match(source, /globalStart \? resolveLongTermProfile\(options\.agentProfile\)/);
  assert.match(source, /sessionCwd !== agentHome\(newSessionProfile\.name\)/);
  assert.match(source, /trusted threads and trigger runs use only the global long-term profile, in its home/);
  assert.match(source, /newSessionProfile\?\.longTerm && options\.agentProfileTrust !== "trusted" && options\.agentProfileTools === undefined/);
  assert.match(source, /Long-term agent \$\{newSessionProfile\.name\} runs only in its thread/);
});

test("an isolated trigger run resolves the global long-term profile, in the agent's home only; a resumed session never applies the tool override", () => {
  assert.match(source, /const globalStart = trustedStart \|\| \(!sessionFile && options\.agentProfile !== undefined && options\.agentProfileTools !== undefined\)/);
  assert.match(source, /globalStart \? resolveLongTermProfile\(options\.agentProfile\)/);
  assert.match(source, /if \(globalStart && \(!newSessionProfile \|\| sessionCwd !== agentHome\(newSessionProfile\.name\)\)\)/);
  assert.match(source, /if \(newSessionProfile && options\.agentProfileTools\) activeTools = activeTools\.filter/);
});

test("agent_notify is registered only in trusted long-term threads", () => {
  assert.match(source, /trustedThread: Boolean\(trustedThread && snapshotProfile\)/);
  assert.match(agentProfileSource, /options\.trustedThread && options\.agentName \? \[createAgentNotifyExtension\(\{ agentName: options\.agentName \}\), createAgentApproveExtension\(\{ agentName: options\.agentName \}\), createAgentDelegateExtension\(\{ agentName: options\.agentName \}\)] : \[\]/);
});

test("a profile model registered only at session_start is switched to after start", () => {
  assert.match(source, /parseSubagentModelOrDeferred\(services\.modelRuntime, newSessionProfile\.model\)/);
  assert.match(source, /deferredInitialModel \?\? deferredProfileModel/);
  assert.match(source, /levelBeforeSwitch = inner\.agent\.state\?\.thinkingLevel[\s\S]*?type: "set_model", provider: deferredModel\.provider[\s\S]*?initial\?\.thinkingLevel \?\? levelBeforeSwitch[\s\S]*?type: "set_thinking_level", level/);
});
