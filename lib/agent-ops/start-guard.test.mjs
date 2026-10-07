import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-start-guard-"));
const jiti = (await import("jiti")).createJiti(import.meta.url);
const { assertTaskStillStartable } = await jiti.import("./start-guard.ts");
const { DEFAULT_AGENT_OPS_SETTINGS } = await jiti.import("./settings.ts");

const task = { id: "t1", profile: "ada", status: "running" };
const deps = (current, settings = {}) => ({ readTask: () => current, readSettings: () => ({ ...DEFAULT_AGENT_OPS_SETTINGS, ...settings }) });

test("a running, unpaused task may send its prompt", () => {
  assert.doesNotThrow(() => assertTaskStillStartable(task, deps(task)));
});

test("a task a pause cancelled while starting, or removed, never sends", () => {
  assert.throws(() => assertTaskStillStartable(task, deps({ ...task, status: "cancelled" })), /cancelled while starting/);
  assert.throws(() => assertTaskStillStartable(task, deps(null)), /removed while starting/);
});

test("a global or per-agent pause stops the send; the agent falls back to the profile", () => {
  assert.throws(() => assertTaskStillStartable(task, deps(task, { paused: true })), /agent paused/);
  assert.throws(() => assertTaskStillStartable(task, deps(task, { pausedAgents: ["ada"] })), /agent paused/);
  assert.doesNotThrow(() => assertTaskStillStartable({ ...task, agent: "bob" }, deps(task, { pausedAgents: ["ada"] })));
});
