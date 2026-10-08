import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("a queued hand-over or review confirms the chosen target with a toast", () => {
  assert.match(chat, /onQueued=\{\(name\) => \{ addNotice\(\{ type: "success", message: t\("agents\.mention\.queued", \{ name \}\) \}\);/);
});

const shell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("hand-over targets carry paused and running from the rail poll; the composer mention keeps names", () => {
  assert.match(shell, /const handToAgents = useMemo\(\(\) => agents\.map\(\(\{ name, paused, running \}\) => \(\{ name, paused: paused \|\| allPaused, running \}\)\), \[agents, allPaused\]\);/);
  assert.match(chat, /handToAgents\?: HandTarget\[\];/);
  assert.match(chat, /\.filter\(\(agent\) => agent\.name !== trustedAgentName\)/);
  assert.match(chat, /const mentionTargets = useMemo\(\(\) => handTargets\.map\(\(agent\) => agent\.name\), \[handTargets\]\);/);
  assert.match(chat, /mentionAgents=\{mentionTargets\.length > 0 \? mentionTargets : undefined\}/);
  assert.match(chat, /<QueueTaskDialog agentName=\{\(handTargets\.find\(\(agent\) => !agent\.paused\) \?\? handTargets\[0\]\)\.name\} targetAgents=\{handTargets\}/);
});

test("a trusted thread shows the pending strip, refreshed at once after a queue", () => {
  assert.match(chat, /import \{ PendingRequests \} from "\.\/agents\/PendingRequests";/);
  assert.match(chat, /\{trustedAgentName \? <PendingRequests agentName=\{trustedAgentName\} refreshKey=\{pendingRefresh\} \/> : null\}/);
  assert.equal(chat.match(/setPendingRefresh\(\(tick\) => tick \+ 1\)/g)?.length, 2); // dialog and @Name
});
