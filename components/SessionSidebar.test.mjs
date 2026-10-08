import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { getSessionListIndices } = await jiti.import("./SessionSidebar.tsx");

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const sessionItemSource = source.slice(source.indexOf("function SessionItem("));

test("scrolling keeps the focused session and the viewport mounted without expanding the whole window", () => {
  for (const [scrollTop, focusedIndex] of [[0, 1999], [10000, 0]]) {
    const indices = getSessionListIndices(2000, scrollTop, 335, focusedIndex);
    const firstVisible = Math.floor(scrollTop / 54);
    const lastVisible = Math.ceil((scrollTop + 335) / 54) - 1;
    for (let index = firstVisible; index <= lastVisible; index++) assert.ok(indices.includes(index));
    assert.ok(indices.includes(focusedIndex));
    assert.equal(indices.length, 24);
    assert.equal(new Set(indices).size, indices.length);
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  }
  assert.equal(getSessionListIndices(2000, 0, 335, 3).length, 23);
  const blurred = getSessionListIndices(2000, 10000, 335);
  assert.equal(blurred.length, 23);
  assert.ok(!blurred.includes(0));
});

test("session windows stay valid after a project shrinks and before the viewport is measured", () => {
  assert.deepEqual(getSessionListIndices(5, 80000, 335, 1999), [0, 1, 2, 3, 4]);
  assert.deepEqual(getSessionListIndices(0, 80000, 335, 1999), []);
  assert.equal(getSessionListIndices(2000, 0, 0).length, 28);
});

test("only Shift+click bypasses session deletion confirmation", () => {
  assert.match(
    sessionItemSource,
    /const handleDeleteClick[\s\S]*?if \(e\.shiftKey\) \{\s*void performDelete\(\);\s*\} else \{\s*setConfirmDelete\(true\);/,
  );
});

test("persists and exposes a vertical session/explorer resize handle", () => {
  assert.match(source, /axis: "vertical"/);
  assert.match(source, /storageKey: "pi-web:sidebar-session-pane-height"/);
  assert.match(source, /Math\.round\(\(paneHeight \+ explorerHeight\) \/ 2\)/);
  assert.match(source, /ref=\{sessionPaneRef\}[\s\S]*?<SessionSearch/);
  assert.match(source, /data-resize-handle="sidebar-sections"/);
  assert.match(source, /sidebar-section-resize-handle/);
  assert.match(globalStyles, /\.sidebar-section-resize-handle:focus-visible::after/);
  assert.doesNotMatch(globalStyles, /\.sidebar-section-resize-handle:focus-visible \{[^}]*outline: 2px solid var\(--accent\)/);
  assert.match(globalStyles, /\.sidebar-section-resize-handle::after[\s\S]*?background: transparent/);
  assert.match(source, /borderTop: "1px solid var\(--border\)"/);
  assert.match(source, /var\(--sidebar-session-pane-height, 320px\)/);
  assert.match(source, /minHeight: explorerOpen \? EXPLORER_PANE_MIN_HEIGHT : 0/);
});

test("session rows are keyboard reachable; Delete only opens the inline confirmation, Shift included", () => {
  assert.match(sessionItemSource, /tabIndex=\{0\}\s*role="button"/);
  assert.match(sessionItemSource, /aria-current=\{isSelected \? "true" : undefined\}/);
  assert.match(sessionItemSource, /aria-label=\{rowLabel\}/);
  assert.match(sessionItemSource, /onKeyDown=\{handleRowKeyDown\}/);
  const keyHandler = sessionItemSource.slice(sessionItemSource.indexOf("const handleRowKeyDown"), sessionItemSource.indexOf("// Fixed-height outer wrapper"));
  assert.match(keyHandler, /if \(e\.target !== e\.currentTarget \|\| confirmDelete \|\| renaming\) return;/);
  assert.match(keyHandler, /if \(e\.key === "Delete"\) \{ e\.preventDefault\(\); setConfirmDelete\(true\); \}/);
  assert.match(keyHandler, /if \(confirmDelete && e\.key === "Escape"\) \{\s*e\.preventDefault\(\);/);
  assert.doesNotMatch(keyHandler, /performDelete/);
  assert.doesNotMatch(keyHandler, /shiftKey/);
});

test("arrow keys move focus to the neighbouring row, mounting it before focusing it", () => {
  assert.match(source, /onMoveFocus=\{\(direction\) => focusSessionRow\(index \+ direction\)\}/);
  assert.match(source, /setFocusedSessionId\(family\.root\.id\);\s*requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /row\?\.scrollIntoView\(\{ block: "nearest" \}\);\s*row\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(sessionItemSource, /data-session-row=\{session\.id\}/);
  assert.match(globalStyles, /\.session-row:focus-visible \{ outline: 2px solid var\(--accent\); outline-offset: -2px; \}/);
});

test("row actions show on hover, focus within or behind ⋯ on a coarse pointer; failures are shown for 4 s", async () => {
  assert.match(sessionItemSource, /\{!session\.transient && isCoarsePointer && \(/);
  assert.match(sessionItemSource, /aria-label=\{t\("sidebar\.moreActions"\)\}/);
  assert.match(sessionItemSource, /aria-expanded=\{actionsOpen\}/);
  assert.match(sessionItemSource, /aria-label=\{t\("sidebar\.rename"\)\}/);
  assert.match(sessionItemSource, /aria-label=\{t\("sidebar\.delete"\)\}/);
  assert.doesNotMatch(sessionItemSource, /\/\/ ignore/);
  assert.match(sessionItemSource, /setActionError\(t\("sidebar\.renameFailed"\)\)/);
  assert.match(sessionItemSource, /setActionError\(t\("sidebar\.deleteFailed"\)\)/);
  assert.match(sessionItemSource, /setTimeout\(\(\) => setActionError\(null\), 4000\)/);
  assert.match(sessionItemSource, /<span role="status"/);
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["sidebar.moreActions", "sidebar.renameFailed", "sidebar.deleteFailed", "sidebar.sessionRowLabel"]) assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
  }
});

test("polls running sessions only while the tab is visible", () => {
  assert.doesNotMatch(source, /new EventSource\("\/api\/agent\/running\/events"\)/);
  assert.match(source, /fetch\("\/api\/agent\/running"/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
});

test("exposes the polled running-session set to the shell", () => {
  assert.match(source, /onRunningSessionIdsChange\?: \(ids: Set<string>\) => void/);
  assert.match(source, /onRunningSessionIdsChange\?\.\(runningSessionIds\)/);
});

test("exposes the loaded session catalog to the shell", () => {
  assert.match(source, /onSessionsChange\?: \(sessions: SessionInfo\[\]\) => void/);
  assert.match(source, /onSessionsChange\?\.\(allSessions\)/);
});

test("subagent completion stays silent and never becomes unread", () => {
  assert.match(source, /completionNotificationSuppressedSessionIds\?: string\[\]/);
  assert.match(
    source,
    /completedWithNotifications = completedInBackground\.filter\([\s\S]*?!previousSuppressedCompletionSessionIdsRef\.current\.has\(id\)[\s\S]*?!knownSubagentIds\.has\(id\)/,
  );
  assert.match(source, /completedWithNotifications\.forEach\(\(id\) => next\.add\(id\)\)/);
  assert.match(source, /if \(completedWithNotifications\.length > 0\) \{\s*onBackgroundTaskDone\?\.\(\)/);
  assert.match(
    source,
    /filter\(\(session\) => session\.relation\?\.kind !== "subagent"\)[\s\S]*?unreadEligibleIds\.has\(id\)/,
  );
});

test("includes project activity counts in accessible labels", () => {
  assert.match(
    source,
    /aria-label=\{`\$\{t\("sidebar\.agentRunning"\)\} \(\$\{activity\.running\}\)`\}/,
  );
  assert.match(
    source,
    /aria-label=\{`\$\{t\("sidebar\.newSessionActivity"\)\} \(\$\{activity\.unread\}\)`\}/,
  );
});

test("formats session timestamps with the active locale", () => {
  assert.match(source, /import \{ formatRelativeTime \} from "@\/lib\/i18n\/format"/);
  assert.match(sessionItemSource, /const \{ locale, t \} = useI18n\(\)/);
  assert.match(sessionItemSource, /formatRelativeTime\(session\.modified, locale\)/);
});

test("does not persist an unchanged fallback title ending in whitespace", () => {
  assert.match(
    sessionItemSource,
    /const name = renameValue\.trim\(\);[\s\S]*?if \(renameValue === title \|\| name === \(session\.name \?\? ""\)\) return;/,
  );
});

test("offers the downstream context-menu hook only on a normal session row", () => {
  assert.match(sessionItemSource, /const handleContextMenu[\s\S]*?dispatchSessionRowContextMenu\(\{/);
  assert.match(
    sessionItemSource,
    /onContextMenu=\{confirmDelete \|\| renaming \? undefined : handleContextMenu\}/,
  );
});

test("lifecycle refreshes bypass the cache while cross-window polling reuses it", () => {
  assert.match(source, /function sessionListUrl\(summary: boolean, force: boolean\)/);
  assert.match(source, /if \(summary\) return "\/api\/sessions\?summary=1"/);
  assert.match(source, /if \(force\) return "\/api\/sessions\?force=1"/);
  assert.match(source, /cache: "no-store"/);
  // First paint uses the cheap summary listing, then hydrates after a delay.
  assert.match(source, /loadSessions\(true, false, true\)/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*?void loadSessions\(false, true\)/);
  assert.match(source, /data\.sessionListVersion !== sessionListVersionRef\.current[\s\S]*?await loadSessions\(\)/);
  assert.doesNotMatch(source, /sessionRefreshDone|sessionRefreshTimerRef|title=\{t\("sidebar\.refresh"\)\}/);
  assert.match(source, /loadSessions\(false, true\);[\s\S]*?onBackgroundTaskDone/);
});

test("does not expose disk-backed actions for transient sessions", () => {
  assert.match(sessionItemSource, /if \(session\.transient\) return;/);
  assert.match(sessionItemSource, /\{!session\.transient && !isCoarsePointer && \(hovered \|\| focusWithin\) && \(/);
});

test("hides subagent rows and aggregates their state into the main session row", () => {
  assert.match(source, /const sessionFamilies = useMemo\(\(\) => listSessionFamilies\(filteredSessions\)/);
  assert.match(source, /familySessions\.some\(\(session\) => session\.id === selectedSessionId\)/);
  assert.match(source, /familySessions\.some\(\(session\) => runningSessionIds\.has\(session\.id\)\)/);
  assert.doesNotMatch(source, /function SessionTreeItem/);
});

test("Escape clears a session search query first, then closes the search and refocuses its toggle", () => {
  assert.match(source, /const sessionSearchToggleRef = useRef<HTMLButtonElement>\(null\);/);
  assert.match(source, /<button\s+ref=\{sessionSearchToggleRef\}\s+type="button"/);
  assert.match(
    source,
    /if \(event\.key === "Escape"\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*if \(sessionSearchQuery\) \{\s*setSessionSearchQuery\(""\);\s*return;\s*\}\s*setSessionSearchOpen\(false\);\s*sessionSearchToggleRef\.current\?\.focus\(\);\s*\}/,
  );
});
