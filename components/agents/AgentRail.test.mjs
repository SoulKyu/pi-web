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

test("the global tasks board: rail button, 5 s refresh cleared on close, grouped by agent, four locales", async () => {
  const board = await readFile(new URL("./TasksBoard.tsx", import.meta.url), "utf8");
  assert.match(rail, /aria-label=\{t\("agents\.rail\.tasks"\)\}/);
  assert.match(rail, /onClick=\{onShowTasks\}/);
  assert.match(shell, /<TasksBoard/);
  assert.match(shell, /onShowTasks=\{\(\) => setTasksBoardOpen\(true\)\}/);
  assert.match(board, /fetch\("\/api\/agent-ops\/tasks"/);
  assert.match(board, /setInterval\(\(\) => void load\(\), REFRESH_MS\)/);
  assert.match(board, /clearInterval\(timer\)/);
  assert.match(board, /task\.agent \?\? OTHER/);
  assert.match(board, /onSelectAgent=\{onSelectAgent\}/);
  assert.doesNotMatch(board, /\(\?<[=!]/);
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["agents.rail.tasks", "agents.board.title", "agents.board.openAgent", "agents.board.other", "agents.board.truncated"]) assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
  }
});
test("rail tooltips carry Ctrl+Alt+<n> up to 9 and the nav label mentions Alt+arrows", () => {
  assert.match(rail, /index < 9 \? ` · Ctrl\+Alt\+\$\{index \+ 1\}` : ""/);
  assert.match(rail, /<nav aria-label=\{t\("agents\.rail\.shortcutsHint"\)\}/);
});

test("the inbox: rail button with the summed unread, panel polling only while open, deep link through openAgent(name, entryId), four locales", async () => {
  const panel = await readFile(new URL("./InboxPanel.tsx", import.meta.url), "utf8");
  assert.match(rail, /aria-label=\{t\("agents\.rail\.inbox"\)\}/);
  assert.match(rail, /onClick=\{onShowInbox\}/);
  assert.match(rail, /agents\.reduce\(\(sum, agent\) => sum \+ agent\.unread, 0\)/);
  assert.match(shell, /<InboxPanel/);
  assert.match(shell, /onShowInbox=\{\(\) => setInboxOpen\(true\)\}/);
  assert.match(shell, /onOpen=\{\(name, entryId\) => \{ setInboxOpen\(false\); void openAgent\(name, entryId\); \}\}/);
  assert.match(panel, /fetch\("\/api\/agents\/inbox"/);
  assert.match(panel, /setInterval\(\(\) => void load\(\), REFRESH_MS\)/);
  assert.match(panel, /clearInterval\(timer\)/);
  assert.match(panel, /onOpen\(group\.name, item\.entryId\)/);
  assert.doesNotMatch(panel, /\(\?<[=!]/);
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["agents.rail.inbox", "agents.inbox.title", "agents.inbox.empty", "agents.inbox.approval"]) assert.match(messages, new RegExp(`"${key.replaceAll(".", "\\.")}"`), `${locale} ${key}`);
  }
});

test("pausing all agents asks inline; Escape cancels without reaching the global Stop shortcut", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url);
  assert.doesNotMatch(rail, /window\.confirm/);
  assert.match(rail, /onClick=\{\(\) => \(paused \? void togglePause\(\) : setConfirmingPause\(true\)\)\}/);
  assert.match(rail, /role="group"\s+aria-label=\{t\("agentOps\.pause\.confirm"\)\}/);
  assert.match(rail, /if \(event\.key !== "Escape"\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*closePauseConfirm\(\);/);
  assert.match(rail, /onClick=\{\(\) => \{ closePauseConfirm\(\); void togglePause\(\); \}\}/);
  assert.match(rail, /aria-label=\{t\("agentOps\.pause\.confirmYes"\)\}/);
  assert.match(rail, /ref=\{pauseCancelRef\}/);
  assert.match(rail, /useEffect\(\(\) => \{ if \(confirmingPause\) pauseCancelRef\.current\?\.focus\(\); \}, \[confirmingPause\]\);/);
  assert.match(rail, /requestAnimationFrame\(\(\) => pauseButtonRef\.current\?\.focus\(\)\)/);
  for (const id of ["en", "fr", "zh-CN", "zh-TW"]) {
    const locale = Object.values(await jiti.import(`../../lib/i18n/messages/${id}.ts`)).find((value) => value?.messages);
    assert.equal(typeof locale.messages["agentOps.pause.confirmYes"], "string", id);
  }
});
