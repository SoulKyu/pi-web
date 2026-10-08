import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const source = await readFile(new URL("./spawn.ts", import.meta.url), "utf8");

// startRpcSession is injected through the third parameter, so no real session starts.
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-spawn-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { startAgentProfileRun } = await jiti.import("./spawn.ts");
const reg = await jiti.import("../agents/registry.ts");
const { profilePinSha256 } = await jiti.import("./trigger-store.ts");
reg.createLongTermAgent({ name: "spawner", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } });
const pin = profilePinSha256(reg.resolveLongTermProfile("spawner"));
const fakeStart = (active = [{ name: "read", active: true }]) => {
  const calls = [];
  const session = {
    onEvent: () => () => {}, shutdown: async () => {}, waitUntilReady: async () => {},
    send: async (cmd) => (cmd.type === "get_tools" ? active : null),
  };
  return { calls, deps: { startRpcSession: async (...args) => { calls.push(args); return { session, realSessionId: "real" }; } } };
};
const task = { profile: "spawner", cwd: "/nowhere", prompt: "p", origin: "trigger", pinnedProfileSha256: pin };

test("a trigger run passes the task's tool subset and model to the session start", async () => {
  const { calls, deps } = fakeStart();
  await startAgentProfileRun({ ...task, tools: ["read"], model: "zai/glm-5.3-flash" }, undefined, deps);
  const options = calls[0][3];
  assert.deepEqual(options.agentProfileTools, ["read"]);
  assert.deepEqual(options.initialModel, { provider: "zai", modelId: "glm-5.3-flash" });
});

test("a hand-edited task subset never widens the allowlist: bash does not reach agentProfileTools", async () => {
  const { calls, deps } = fakeStart();
  await startAgentProfileRun({ ...task, tools: ["bash", "read"] }, undefined, deps);
  assert.deepEqual(calls[0][3].agentProfileTools, ["read"]);
  const none = fakeStart([]); // the session activates nothing once narrowed to []
  await startAgentProfileRun({ ...task, tools: ["bash"] }, undefined, none.deps);
  assert.deepEqual(none.calls[0][3].agentProfileTools, []);
});

test("a trigger run without tools gets the whole allowlist and no model override; a ui run gets neither", async () => {
  const first = fakeStart();
  await startAgentProfileRun(task, undefined, first.deps);
  assert.deepEqual([...first.calls[0][3].agentProfileTools].sort(), ["find", "grep", "ls", "memory_save", "memory_search", "read"]);
  assert.equal("initialModel" in first.calls[0][3], false);
  const second = fakeStart();
  await startAgentProfileRun({ profile: "spawner", cwd: "/nowhere", prompt: "p", origin: "ui" }, undefined, second.deps);
  assert.equal("agentProfileTools" in second.calls[0][3], false);
});

test("a ui task with a tool subset and no pin is narrowed and checked like a trigger run", async () => {
  const { calls, deps } = fakeStart();
  await startAgentProfileRun({ profile: "spawner", cwd: "/nowhere", prompt: "p", origin: "ui", tools: ["read", "bash", "memory_search"] }, undefined, deps);
  assert.deepEqual(calls[0][3].agentProfileTools, ["read", "memory_search"]);
  const wide = fakeStart([{ name: "read", active: true }, { name: "bash", active: true }]); // enforceTriggerTools refuses a session that activates bash
  await assert.rejects(startAgentProfileRun({ profile: "spawner", cwd: "/nowhere", prompt: "p", origin: "ui", tools: ["read"] }, undefined, wide.deps));
});

test("a trigger run narrows the session to the allowlist, never trusted, and re-checks the pin against the global profile", () => {
  assert.match(source, /\.\.\.\(narrowed \? \{ agentProfileTools: \(task\.tools \?\? \[\.\.\.TRIGGER_TOOL_ALLOWLIST\]\)\.filter\(\(t\) => TRIGGER_TOOL_ALLOWLIST\.has\(t\)\) \} : \{\}\)/);
  assert.doesNotMatch(source, /agentProfileTrust/);
  assert.match(source, /resolveLongTermProfile\(task\.profile\)/);
  assert.match(source, /await enforceTriggerTools\(session, task\.tools\)/);
});

test("an isolated task without tools and without a pin is narrowed to the allowlist and checked", async () => {
  const { calls, deps } = fakeStart();
  await startAgentProfileRun({ profile: "spawner", cwd: "/nowhere", prompt: "p", origin: "ui", target: "isolated" }, undefined, deps);
  assert.deepEqual([...calls[0][3].agentProfileTools].sort(), ["find", "grep", "ls", "memory_save", "memory_search", "read"]);
  const wide = fakeStart([{ name: "read", active: true }, { name: "bash", active: true }]);
  await assert.rejects(startAgentProfileRun({ profile: "spawner", cwd: "/nowhere", prompt: "p", origin: "ui", target: "isolated" }, undefined, wide.deps));
});

test("the prompt is sent only after the caller's start check passes", () => {
  assert.match(source, /beforePrompt\?\.\(\)[\s\S]*watchPromptRun/);
});

test("a refused start shuts the session down and rethrows, like enforceTriggerTools", () => {
  assert.match(source, /try \{ beforePrompt\?\.\(\); \} catch \(error\) \{ await session\.shutdown\(\)\.catch\(\(\) => \{\}\); throw error; \}\n  const run = watchPromptRun/);
});

test("the handle returns the collector's usage next to done and abort", () => {
  assert.match(source, /return \{ sessionId: realSessionId, done: run\.done, abort: run\.abort, usage: run\.usage \}/);
});
