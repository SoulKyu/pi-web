import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("openAgent shows agents.error when the thread cannot be opened", () => {
  const body = source.slice(source.indexOf("const openAgent = useCallback"), source.indexOf("agentMountOpenedRef.current ="));
  assert.match(body, /window\.alert\(translate\("agents\.error", \{ error:/);
});

test("the Agent pseudo-tab is first, never persisted, and brings the panel back", () => {
  assert.match(source, /const AGENT_TAB_ID = "agent"/);
  assert.match(source, /id: AGENT_TAB_ID, label: agentDetail\.name, filePath: agentDetail\.home, closable: false/);
  assert.match(source, /showAgentPanel = Boolean\(agentSpaceRight\) && \(activeFileTabId === AGENT_TAB_ID \|\| !activeFileTab/);
  assert.doesNotMatch(source, /\{!showAgentPanel && <div style/);
  assert.match(source, /activeId: activeFileTabId === AGENT_TAB_ID \? null : activeFileTabId/);
  assert.match(source, /if \(!activeAgent\) \{[^}]*setActiveFileTabId\(\(cur\) => cur === AGENT_TAB_ID/);
});

test("the mobile agent drawer has two tabs and remembers the last one", () => {
  assert.match(source, /localStorage\.getItem\(DRAWER_TAB_KEY\)/);
  assert.match(source, /readDrawerTab\(/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{drawerTab === "home"\}/);
  assert.match(source, /agents\.drawer\.home/);
  assert.match(source, /agents\.drawer\.status/);
});

test("?entry= is handed to the existing search scroll once the agent thread is open", () => {
  assert.match(source, /void openAgent\(initialNavigation\.agentName, initialNavigation\.entryId\)/);
  assert.match(source, /await handleOpenSession\(data\.sessionId\);\n    if \(entryId\) setSearchTarget\(\{ sessionId: data\.sessionId, entryId \}\)/);
});
