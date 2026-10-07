import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { readDrawerTab, DRAWER_TAB_KEY } = await jiti.import("./drawer-tab.ts");

test("the storage key is stable", () => assert.equal(DRAWER_TAB_KEY, "pi-agent-drawer-tab"));

test("readDrawerTab keeps the two known tabs and defaults to home", () => {
  assert.equal(readDrawerTab("status"), "status");
  assert.equal(readDrawerTab("home"), "home");
  assert.equal(readDrawerTab(null), "home");
  assert.equal(readDrawerTab("other"), "home");
});
