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

const turn = (agent) => {
  const track = createTurnUsageTracker({ trustedAgent: () => agent, hasPendingPrompt: () => true, sessionId: () => "s1" });
  return track;
};
const reply = { type: "message_end", message: { role: "assistant", usage: { input: 4, output: 2, cost: { total: 0 } } } };
const userRecords = (agent) => readRunRecords({ agent }).filter((r) => r.origin === "user");

test("a thread task cancelled before agent_end leaves the turn to the runner: no user record", () => {
  const task = store.createTask({ profile: "a", cwd: "/p", title: "t", prompt: "p", origin: "trigger", agent: "a", target: "thread" });
  assert.ok(store.claimTask(task.id));
  const track = turn("a");
  track({ type: "agent_start" });
  track(reply);
  store.updateTask(task.id, { status: "cancelled", completedAt: new Date().toISOString() }); // what the cancel route writes before it aborts
  track({ type: "agent_end" });
  assert.equal(userRecords("a").length, 0);
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
});
