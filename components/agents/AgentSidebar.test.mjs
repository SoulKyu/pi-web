import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n.tsx");
const { AgentSidebar } = await jiti.import("./AgentSidebar.tsx");
const source = await readFile(new URL("./AgentSidebar.tsx", import.meta.url), "utf8");
const noop = () => {};
const agent = { name: "Martin", home: "/h/Martin", avatar: { emoji: "🛠", color: "#3d9970" }, role: "r", toolsPreset: "full", mcpServers: [], model: "a/b", thinking: "low" };
const render = (isMobile) => renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(AgentSidebar, {
  agent, isMobile, status: React.createElement("p", null, "STATUS"), onOpenFile: noop, onOpenTerminal: noop, onOpenSession: noop, onProfileSaved: noop, onDeleted: noop, onThreadReset: noop,
})));

test("the toolbar row is the session sidebar's: tablist, spacer, + Task, Search", () => {
  const html = render(false);
  assert.match(html, /^<div class="session-sidebar agent-sidebar"><div class="sidebar-header"><div class="sidebar-tabs-list" role="tablist" aria-label="Agent sidebar view">/);
  assert.match(html, /<span class="sidebar-header-spacer"><\/span><button type="button" class="sidebar-new-button"[^>]*>[\s\S]*?<span class="sidebar-new-label">Task<\/span><\/button><button type="button"[^>]*class="sidebar-search-toggle"/);
});

test("Files, Triggers, Settings tabs; Status only on phones; Files selected by default", () => {
  const desktop = render(false);
  const tabs = [...desktop.matchAll(/role="tab" id="agent-sidebar-tab-(\w+)" aria-selected="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(tabs, ["files:true", "triggers:false", "settings:false"]);
  assert.match(render(true), /id="agent-sidebar-tab-status"/);
  assert.doesNotMatch(desktop, /STATUS/);
});

test("panels stay mounted and hidden, so the tree, its search and an upload survive a switch", () => {
  assert.match(source, /role="tabpanel"[\s\S]*?hidden=\{tab !== "files"\}/);
  assert.match(source, /hidden=\{tab !== "triggers"\}/);
  assert.match(source, /hidden=\{tab !== "settings"\}/);
  assert.equal((source.match(/<FileExplorer\s/g) ?? []).length, 1);
});

test("arrow keys, Home and End move between the tabs", () => {
  assert.match(source, /if \(event\.key !== "ArrowLeft" && event\.key !== "ArrowRight" && event\.key !== "Home" && event\.key !== "End"\) return;/);
  assert.match(source, /tabRefs\.current\[next\]\?\.focus\(\);/);
});

test("Search opens the file search, switching to Files first; + Task opens the queue dialog above everything", () => {
  assert.match(source, /if \(tab !== "files"\) \{\s*switchTab\("files"\);\s*setFileSearchOpen\(true\);\s*return;\s*\}\s*setFileSearchOpen\(\(open\) => !open\);/);
  assert.match(source, /createPortal\(<QueueTaskDialog agentName=\{agent\.name\} onClose=\{\(\) => setQueueOpen\(false\)\} onQueued=\{\(\) => setQueueOpen\(false\)\} \/>, document\.body\)/);
});

test("the files head has terminal, file manager, upload and refresh, and no project picker", () => {
  const html = render(false);
  const head = html.slice(html.indexOf('class="sidebar-files-actions"'), html.indexOf("</div>", html.indexOf('class="sidebar-files-actions"')));
  assert.equal((head.match(/class="sidebar-tool-button/g) ?? []).length, 4);
  assert.doesNotMatch(source, /ProjectWorktreePicker/);
});

test("the tab persists through the agent tab store", () => {
  assert.match(source, /useState<AgentSidebarTab>\(\(\) => loadAgentSidebarTab\(isMobile\)\)/);
  assert.match(source, /saveAgentSidebarTab\(next\);/);
});
