import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const chat = await read("../../ChatWindow.tsx");
const shell = await read("../../AppShell.tsx");

test("conversation mode only for a trusted agent thread with agent data", () => {
  assert.match(chat, /const conversation = Boolean\(trustedAgentName && agentConversation\);/);
  assert.match(chat, /data-chat-style=\{conversation \? "agent" : undefined\}/);
  assert.match(chat, /data-agent-details=\{conversation \? \(details \? "on" : "off"\) : undefined\}/);
  assert.match(chat, /conversation=\{conversation\}/);
});

test("details: persisted, and a revealed process keeps today's group", () => {
  assert.match(chat, /useState\(loadDetails\)/);
  assert.match(chat, /savePref\(DETAILS_KEY, next\)/);
  assert.match(chat, /if \(conversation && !details && !revealProcess\) \{/);
  assert.match(chat, /hasSpeechAct/);
  assert.match(chat, /data-process/);
});

test("group headers come from one tracker per render; the streaming tail gets one when the agent did not speak last", () => {
  assert.match(chat, /const groups = createGroupTracker\(\);/);
  assert.match(chat, /groups\.open\(author, messageTimestamp, dayLabel !== null \|\| idx === unreadAt\)/);
  assert.match(chat, /groups\.last\(\) !== "agent"/);
});

test("the working line names the agent; the plain phase line stays for ordinary sessions", () => {
  assert.match(chat, /className="conv-working"/);
  assert.match(chat, /t\("agents\.chat\.working", \{ name: agentConversation\.agent\.name \}\)/);
  assert.match(chat, /!conversation && agentRunning && !hasStreamingContent/);
});

test("AppShell passes the active agent, its role, the global pause and quiet hours", () => {
  assert.match(shell, /agentConversation=\{/);
  assert.match(shell, /quietHours: healthState\?\.health\.quietHours \?\? false/);
});
