import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const rail = await readFile(new URL("./AgentRail.tsx", import.meta.url), "utf8");
const dialog = await readFile(new URL("./NewAgentDialog.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");

test("the rail polls /api/agents, renders an avatar per agent with badge and dot, plus + and ☰", () => {
  assert.match(rail, /fetch\("\/api\/agents"/);
  assert.match(rail, /document\.visibilityState === "visible" \? 5_000 : 30_000/);
  assert.match(rail, /<AgentAvatar/);
  assert.match(rail, /aria-label=\{t\("agents\.rail\.new"\)\}/);
  assert.match(rail, /aria-label=\{t\("agents\.rail\.sessions"\)\}/);
  assert.match(rail, /aria-current=\{agent\.name === activeAgent \? "true" : undefined\}/);
});
test("the creation form posts the D7 fields and shows the home path read-only", () => {
  assert.match(dialog, /fetch\("\/api\/agents", \{ method: "POST"/);
  assert.match(dialog, /toolsPreset/);
  assert.match(dialog, /avatar: \{ emoji, color \}/);
  assert.match(dialog, /t\("agents\.new\.home", \{ path/);
  assert.match(dialog, /\/api\/models\?cwd=/);
  assert.doesNotMatch(dialog, /\(\?<[=!]/); // no lookbehind in client code
});
test("AppShell opens an agent through its thread and writes ?agent= instead of ?session=", () => {
  assert.match(shell, /fetch\(`\/api\/agents\/\$\{encodeURIComponent\(name\)\}\/thread`, \{ method: "POST" \}\)/);
  assert.match(shell, /pendingAgentRef\.current = \{ sessionId: data\.sessionId, agentName: name \}/);
  assert.match(shell, /router\.replace\(`\?agent=\$\{encodeURIComponent\(/);
  assert.match(shell, /<AgentRail/);
  assert.match(shell, /initialNavigation\.agentName/);
});
test("?agent= skips the sidebar's project auto-selection and the thread is not remembered as a plain tab session", () => {
  assert.match(shell, /skipInitialProjectSelection=\{initialNavigation\.requestedCwd !== null \|\| initialNavigation\.agentName !== null\}/);
  assert.match(shell, /if \(pendingAgentRef\.current\?\.sessionId !== selectedSession\.id\) setTabOpenSession\(selectedSession\.id\)/);
});
test("the rail shows the state dot and a preview tooltip; the title carries the total unread", () => {
  assert.match(rail, /state=\{agent\.state\}/);
  assert.match(rail, /formatRelativeTime\(agent\.lastActivityAt, locale\)/);
  assert.match(shell, /const windowTitle = totalUnread > 0 \? `\(\$\{totalUnread\}\) \$\{baseTitle\}` : baseTitle/);
});

test("the rail keeps its last snapshot on a failed poll and shows a stale line only then", () => {
  assert.match(rail, /setLastOkAt\(Date\.now\(\)\)/);
  assert.match(rail, /error && lastOkAt !== null && \(vertical \?/);
  assert.match(rail, /title=\{t\("agents\.rail\.stale"/);
  assert.match(rail, /aria-label=\{t\("agents\.rail\.stale"/);
  assert.match(rail, /t\("agents\.rail\.stale", \{ time: new Date\(lastOkAt\)\.toLocaleTimeString\(locale, \{ timeStyle: "short" \}\) \}\)/);
  assert.match(shell, /lastOkAt=\{agentsLastOkAt\}/);
});
