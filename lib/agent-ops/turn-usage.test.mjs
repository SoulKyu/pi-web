import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-turn-"));
const jiti = (await import("jiti")).createJiti(import.meta.url);
const store = await jiti.import("./task-store.ts");
const { readRunRecords } = await jiti.import("./run-registry.ts");
const { createTurnUsageTracker } = await jiti.import("./turn-usage.ts");

const turn = (agent, runnerPromptPending = () => false) =>
  createTurnUsageTracker({ trustedAgent: () => agent, hasPendingPrompt: () => true, runnerPromptPending, sessionId: () => "s1" });
const reply = { type: "message_end", message: { role: "assistant", usage: { input: 4, output: 2, cost: { total: 0 } } } };
const userRecords = (agent) => readRunRecords({ agent }).filter((r) => r.origin === "user");

test("a turn started by the runner's prompt (pending at agent_start) is the runner's: no user record", () => {
  let pending = true;
  const track = turn("a", () => pending);
  track({ type: "agent_start" });
  track(reply);
  pending = false; // the prompt settled before agent_end
  track({ type: "agent_end" });
  assert.equal(userRecords("a").length, 0);
});

test("a user turn while a thread task is merely running in the store is still recorded (no runner prompt pending)", () => {
  const task = store.createTask({ profile: "d", cwd: "/p", title: "t", prompt: "p", origin: "trigger", agent: "d", target: "thread" });
  assert.ok(store.claimTask(task.id));
  const track = turn("d");
  track({ type: "agent_start" });
  track(reply);
  track({ type: "agent_end" });
  assert.equal(userRecords("d").length, 1);
});

test("a plain user turn of a trusted thread appends one record with the collected usage", () => {
  const track = turn("b");
  track({ type: "agent_start" });
  track(reply);
  track({ type: "agent_end" });
  const records = userRecords("b");
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "completed");
  assert.equal(records[0].sessionId, "s1");
  assert.equal(records[0].usage.input, 4);
  assert.equal(records[0].billing, "unknown");
});

test("a provider on the assistant message sets billing on the record", () => {
  const track = turn("c");
  track({ type: "agent_start" });
  track({ type: "message_end", message: { role: "assistant", provider: "zai", model: "glm", usage: { input: 1, output: 1, cost: { total: 0.1 } } } });
  track({ type: "agent_end" });
  assert.equal(userRecords("c")[0].billing, "api");
});
