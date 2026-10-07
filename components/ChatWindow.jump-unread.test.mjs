import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const chat = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the pill shows for a loaded unread start or an unloaded marker with earlier pages", () => {
  assert.match(chat, /unreadAt > 0 \|\| \(Boolean\(unreadMarkerEntryId\) && !entryIds\.includes\(unreadMarkerEntryId as string\) && hasEarlierMessages\)/);
  assert.match(chat, /t\("agents\.thread\.jumpUnread", \{ count: unreadPillCount \}\)/);
  assert.match(chat, /className="agent-jump-unread"/);
});

test("the jump pages upward with a bound and scrolls to the first unread entry, not the marker", () => {
  assert.match(chat, /const JUMP_UNREAD_MAX_PAGES = 20/);
  assert.match(chat, /pages < JUMP_UNREAD_MAX_PAGES/);
  assert.match(chat, /loadContext\(session\.id, activeLeafId, before, \{ signal: controller\.signal \}\)/);
  assert.match(chat, /data-entry-id="\$\{CSS\.escape\(entryIds\[unreadAt\]\)\}"/);
  assert.match(chat, /jumpAbortRef\.current\?\.abort\(\)/);
});

test("the digest line renders above the divider from the frozen marker", () => {
  assert.match(chat, /digestLine\(digestSince\(messages, entryIds, unreadMarkerEntryId \?\? null\), t\)/);
  assert.match(chat, /className="agent-unread-digest"/);
});

test("AppShell passes the rail unread count and the styles exist", () => {
  assert.match(shell, /unreadCount=\{/);
  assert.match(css, /\.agent-jump-unread\b/);
  assert.match(css, /\.agent-unread-digest\b/);
});

test("the jump takes the older-messages lock", () => {
  // Guards the race: without it the top-sentinel observer pages with the same cursor and loadContext prepends the page twice.
  const jump = chat.slice(chat.indexOf("const jumpToUnread"), chat.indexOf("useLayoutEffect", chat.indexOf("const jumpToUnread")));
  assert.match(jump, /loadingOlderRef\.current\) return/);
  assert.match(jump, /loadingOlderRef\.current = true/);
  assert.match(jump, /finally \{\s*loadingOlderRef\.current = false/);
});

test("the pill drops the number when the count is unknown", () => {
  assert.match(chat, /agents\.thread\.jumpUnreadNoCount/);
});
