import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const left = await readFile(new URL("./AgentSpaceLeft.tsx", import.meta.url), "utf8");
const right = await readFile(new URL("./AgentSpaceRight.tsx", import.meta.url), "utf8");
const dialog = await readFile(new URL("./AgentProfileDialog.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");

test("AgentSpaceLeft mounts the home explorer and the profile dialog", () => {
  assert.match(left, /<FileExplorer cwd=\{agent\.home\}/);
  assert.match(left, /<AgentProfileDialog/);
  assert.match(left, /agents\.space\.triggers/);
});

test("AgentSpaceRight shows the status row", () => {
  assert.match(right, /agents\.space\.status/);
  assert.match(right, /agents\.space\.context/);
});

test("AgentProfileDialog patches only changed fields and handles agent_running and delete", () => {
  assert.match(dialog, /method: "PATCH"/);
  assert.match(dialog, /if \(role !== agent\.role\) patch\.role = role/);
  assert.match(dialog, /if \(toolsPreset !== agent\.toolsPreset\) patch\.toolsPreset = toolsPreset/);
  assert.match(dialog, /patch\.model = model \|\| null/);
  assert.match(dialog, /response\.status === 409/);
  assert.match(dialog, /agents\.profile\.running/);
  assert.match(dialog, /method: "DELETE"/);
  assert.match(dialog, /window\.confirm\(t\("agents\.profile\.deleteConfirm"/);
});

test("AppShell renders the agent space and posts the read marker", () => {
  assert.match(shell, /activeAgent && agentDetail \? \(?\s*<AgentSpaceLeft/);
  assert.match(shell, /<AgentSpaceRight/);
  assert.match(shell, /\/read`/);
  assert.match(shell, /agents\.space\.panels/);
  assert.match(shell, /unreadMarkerEntryId=\{activeAgent \? agentUnreadMarker : null\}/);
});

test("the agent panel shows only when no file or terminal tab is active", () => {
  assert.match(shell, /const showAgentPanel = Boolean\(agentSpaceRight\) && !activeFileTab && !terminalTabs\.some/);
  assert.match(shell, /\{showAgentPanel \? \(/);
  assert.match(shell, /\{!showAgentPanel && <div/);
});

test("deleting an agent lands on a draft with no cwd and a bare URL", () => {
  assert.match(shell, /onDeleted=\{handleAgentDeleted\}/);
  assert.match(shell, /const handleAgentDeleted = useCallback/);
  assert.match(shell, /setNewSessionCwd\(null\);[\s\S]*?router\.replace\("\/", \{ scroll: false \}\)/);
});

test("AgentSpaceRight mounts the two memory sections and polls /memory", () => {
  assert.match(right, /agents\.space\.memoryToApprove/);
  assert.match(right, /agents\.space\.memory"/);
  assert.match(right, /<AgentMemoryRecent/);
  assert.match(right, /\/memory`/);
});
