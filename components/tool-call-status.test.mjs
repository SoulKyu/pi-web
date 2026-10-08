import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stableIdSet, toolCallStatus } from "./tool-call-status.ts";

test("status: running wins, then the result decides, then a live run waits instead of saying no result", () => {
  assert.equal(toolCallStatus({ hasResult: true, isError: false, running: true, awaitingResult: true }), "running");
  assert.equal(toolCallStatus({ hasResult: false, isError: false, running: true, awaitingResult: false }), "running");
  assert.equal(toolCallStatus({ hasResult: true, isError: false, running: false, awaitingResult: true }), "done");
  assert.equal(toolCallStatus({ hasResult: true, isError: true, running: false, awaitingResult: false }), "failed");
  assert.equal(toolCallStatus({ hasResult: false, isError: false, running: false, awaitingResult: true }), null);
  assert.equal(toolCallStatus({ hasResult: false, isError: false, running: false, awaitingResult: false }), "none");
});

test("stableIdSet keeps the previous set while the membership is the same", () => {
  const empty = new Set();
  assert.equal(stableIdSet(empty, []), empty);
  const first = stableIdSet(empty, ["a", "b"]);
  assert.deepEqual([...first].sort(), ["a", "b"]);
  assert.equal(stableIdSet(first, ["b", "a"]), first);
  assert.equal(stableIdSet(first, ["b", "a", "a"]), first);
  const changed = stableIdSet(first, ["a"]);
  assert.notEqual(changed, first);
  assert.deepEqual([...changed], ["a"]);
});

test("ChatWindow passes one identity-stable running set and the run flag to MessageView", async () => {
  const chat = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(chat, /runningToolIdsRef\.current = stableIdSet\(runningToolIdsRef\.current, agentPhase\?\.kind === "running_tools" \? agentPhase\.tools\.map\(\(tool\) => tool\.id\) : \[\]\);/);
  assert.equal((chat.match(/runningToolIds=\{runningToolIds\}/g) ?? []).length, 2);
  assert.match(chat, /runActive=\{agentRunning\}/);
});
