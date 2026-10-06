import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const chat = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("the unread divider renders before the first unread entry", () => {
  assert.match(chat, /firstUnreadIndex\(entryIds, unreadMarkerEntryId \?\? null\)/);
  assert.match(chat, /idx === unreadAt/);
  assert.match(chat, /t\("agents\.thread\.unread", \{ count: entryIds\.length - unreadAt \}\)/);
});

test("onLatestEntryViewed fires from a debounced effect keyed on the newest entry", () => {
  assert.match(chat, /const latestEntryId = entryIds\[entryIds\.length - 1\]/);
  assert.match(chat, /document\.visibilityState !== "visible"/);
  assert.match(chat, /window\.setTimeout\(\(\) => onLatestEntryViewed\(latestEntryId\), 1000\)/);
  assert.match(chat, /\[latestEntryId, onLatestEntryViewed\]/);
});

test("the divider also renders once before a process group that contains the first unread entry", () => {
  assert.match(chat, /unreadAt > userIdx && \(unreadAt < finalAssistantIdx \|\| \(unreadAt === finalAssistantIdx && !finalAnswerMessage\)\)/);
  assert.match(chat, /rendered\.push\(unreadDivider\)/);
});
