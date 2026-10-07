import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-log-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url);
const log = await jiti.import("./trigger-log.ts");
const triggers = await jiti.import("./trigger-store.ts");

test("append then read newest first; trims past 600 lines; .log.jsonl is invisible to listTriggers", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  for (let i = 0; i < 650; i++) log.appendTriggerLog(id, { at: `2026-10-07T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z`, source: "webhook", verdict: "refused", reason: "dup" });
  const entries = log.readTriggerLog(id, 1000);
  assert.ok(entries.length <= 500 && entries.length >= 450);
  assert.ok(entries[0].at >= entries[1].at);
  assert.deepEqual(triggers.listTriggers().map((t) => t.id).filter((x) => x === id), []);
  assert.equal(statSync(log.triggerLogPath(id)).mode & 0o777, 0o600);
});

test("junk lines are skipped, the limit applies, a bad id never throws or writes", () => {
  const id = "00000000-0000-4000-8000-000000000002";
  log.appendTriggerLog(id, { at: "2026-10-07T00:00:00.000Z", source: "schedule", verdict: "accepted", taskId: "a" });
  log.appendTriggerLog("../evil", { at: "x", source: "manual", verdict: "accepted" });
  assert.deepEqual(log.readTriggerLog("../evil"), []);
  assert.equal(log.readTriggerLog(id, 1).length, 1);
  assert.deepEqual(log.readTriggerLog("00000000-0000-4000-8000-0000000000ff"), []);
});
