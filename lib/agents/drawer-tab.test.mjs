import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { readAgentSidebarTab, AGENT_SIDEBAR_TAB_KEY } = await jiti.import("./drawer-tab.ts");

test("the storage key is stable and new (the old drawer key is ignored)", () => assert.equal(AGENT_SIDEBAR_TAB_KEY, "pi-agent-sidebar-tab"));

test("readAgentSidebarTab keeps known tabs and defaults to files", () => {
  for (const tab of ["files", "triggers", "settings"]) assert.equal(readAgentSidebarTab(tab, false), tab);
  assert.equal(readAgentSidebarTab(null, false), "files");
  assert.equal(readAgentSidebarTab("home", true), "files");
  assert.equal(readAgentSidebarTab("other", true), "files");
});

test("status exists only on phones: a stored status reads as files on a desktop", () => {
  assert.equal(readAgentSidebarTab("status", true), "status");
  assert.equal(readAgentSidebarTab("status", false), "files");
});
