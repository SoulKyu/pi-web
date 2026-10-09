# Agent sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In agent mode, the left column becomes a sidebar with the session sidebar's toolbar row and look: tabs Files | Triggers | Settings (+ Status on phones), a "+ Task" button and a file Search button.

**Architecture:** A new `components/agents/AgentSidebar.tsx` reuses the session sidebar's markup and CSS classes (`app/sidebar.css`, `app/sidebar-tron.css`), so it looks the same without touching the upstream `SessionSidebar.tsx`. The profile dialog becomes an inline form (`AgentProfileForm.tsx`). `AgentSpaceLeft.tsx` and the phone drawer tabs in `AppShell.tsx` go.

**Tech Stack:** Next.js 16 / React 19 client components, TypeScript, node:test source/render tests (jiti + react-dom/server), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-10-09-agent-sidebar-design.md`

## Global Constraints

- Branch `feat/agent-sidebar`, repo `/home/ubuntu/Workspace/soulkyu/pi-web`. Do not modify `components/SessionSidebar.tsx`.
- Tron identity: no off-palette colors, square corners, glows only on focus / active / running. Reuse sidebar classes; add CSS only to `app/sidebar-tron.css` or `app/globals.css`.
- Keep every existing `data-*`, `aria-*`, `role` that tests pin unless the task rewrites the test.
- Tests: single file `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test <file>`; full suite `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test > /tmp/gate.log 2>&1; rg 'ℹ (tests|pass|fail)' /tmp/gate.log`.
- Typecheck `node_modules/.bin/tsc --noEmit`; lint `npm run lint`. Never `next build`; never stage the `nextjs-agent-rules` block of `AGENTS.md`.
- Deleted or rewritten test assertions are listed in the commit body. Conventional Commits, no AI trailer.
- i18n: every new key in `en`, `fr`, `zh-CN`, `zh-TW` (`lib/i18n/messages.test.mjs` checks `fr` parity).
- No new dependency.

## Review Focus

1. **An upload in progress, a file search, or an expanded tree survives a tab switch.** Panels are `hidden`, never unmounted. Pinned in Task 3 (`hidden={tab !== "files"}` and one `FileExplorer`).
2. **Sub-dialogs opened from the sidebar** (+ Task's `QueueTaskDialog`, the form's secret-rotation and curation dialogs) **render above everything**, not clipped by the sidebar (`overflow: hidden`, `z-index: 200`). Pinned in Tasks 2 and 3 (`createPortal(…, document.body)`).
3. **A phone's stored "status" tab on a desktop** shows Files, not an empty panel. Pinned in Task 1 (`readAgentSidebarTab("status", false) === "files"`).
4. **Switching agents drops unsaved profile edits** and shows the new agent's values. Pinned in Task 4 (`<AgentSidebar key={agentDetail.name}`).
5. **Saving while the thread runs** keeps the form open with the `agents.profile.running` message. Pinned in Task 2 (409 branch, no unmount).

---

### Task 1: Agent sidebar tab store

**Files:**
- Modify: `lib/agents/drawer-tab.ts` (whole file)
- Test: `lib/agents/drawer-tab.test.mjs` (whole file)

**Interfaces:**
- Produces: `type AgentSidebarTab = "files" | "triggers" | "settings" | "status"`, `AGENT_SIDEBAR_TAB_KEY = "pi-agent-sidebar-tab"`, `readAgentSidebarTab(raw: string | null, mobile: boolean): AgentSidebarTab`, `loadAgentSidebarTab(mobile: boolean): AgentSidebarTab`, `saveAgentSidebarTab(tab: AgentSidebarTab): void`.

- [ ] **Step 1: Write the failing test** — replace `lib/agents/drawer-tab.test.mjs`:

```js
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
```

- [ ] **Step 2: Run it, expect FAIL** (`readAgentSidebarTab` is not exported).
- [ ] **Step 3: Implement** — replace `lib/agents/drawer-tab.ts`:

```ts
/** The agent sidebar's tabs; Status (the right panel's content) exists on phones only. */
export type AgentSidebarTab = "files" | "triggers" | "settings" | "status";

export const AGENT_SIDEBAR_TAB_KEY = "pi-agent-sidebar-tab";

const TABS: readonly AgentSidebarTab[] = ["files", "triggers", "settings", "status"];

export function readAgentSidebarTab(raw: string | null, mobile: boolean): AgentSidebarTab {
  const tab = TABS.find((candidate) => candidate === raw) ?? "files";
  return tab === "status" && !mobile ? "files" : tab;
}

export function loadAgentSidebarTab(mobile: boolean): AgentSidebarTab {
  try {
    return readAgentSidebarTab(window.localStorage.getItem(AGENT_SIDEBAR_TAB_KEY), mobile);
  } catch {
    return "files";
  }
}

export function saveAgentSidebarTab(tab: AgentSidebarTab): void {
  try {
    window.localStorage.setItem(AGENT_SIDEBAR_TAB_KEY, tab);
  } catch {
    // The tab still switches when storage is unavailable.
  }
}
```

- [ ] **Step 4: Run the test, expect PASS.** `tsc` fails in `AppShell.tsx` (old imports) until Task 4: do not commit a broken build — keep the old exports alongside for now:

```ts
/** @deprecated removed in Task 4 with the phone drawer tabs. */
export type DrawerTab = "home" | "status";
export const DRAWER_TAB_KEY = "pi-agent-drawer-tab";
export function readDrawerTab(raw: string | null): DrawerTab {
  return raw === "status" ? "status" : "home";
}
```

- [ ] **Step 5: tsc, lint, commit** `feat(agents): agent sidebar tab store`.

---

### Task 2: Inline profile form

**Files:**
- Rename: `components/agents/AgentProfileDialog.tsx` → `components/agents/AgentProfileForm.tsx` (`git mv`)
- Modify: `components/agents/AgentSpaceLeft.tsx:10,24,86-93` (temporary caller until Task 3)
- Tests: `components/agents/AgentSpace.test.mjs:6,26-35,62-69`, `components/shell/toasts.test.mjs:6`, `components/polish-settings-files.test.mjs:7`, `app/api/agents/route.test.mjs:78`, `components/agents/PromptChips.test.mjs:46`; new `components/agents/AgentProfileForm.test.mjs`
- i18n: `agents.profile.discard` in `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts`

**Interfaces:**
- Produces: `export function AgentProfileForm({ agent, onSaved, onDeleted, onThreadReset, onDiscard }: { agent: AgentDetail; onSaved: (agent: AgentDetail) => void; onDeleted: () => void; onThreadReset: () => void; onDiscard: () => void })`. `onDiscard` asks the parent to remount the form (fresh state from `agent`).

- [ ] **Step 1: Write the failing test** — `components/agents/AgentProfileForm.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const form = await readFile(new URL("./AgentProfileForm.tsx", import.meta.url), "utf8");

test("the profile form is inline: no dialog role, backdrop or stacked-dialog registration", () => {
  assert.match(form, /export function AgentProfileForm\(\{ agent, onSaved, onDeleted, onThreadReset, onDiscard \}/);
  assert.doesNotMatch(form, /role="dialog"|backdropStyle|openStackedDialog|onClose\(\)/);
  assert.match(form, /<form className="agent-profile-form" aria-label=\{title\} onSubmit=/);
});

test("Discard asks the parent for a fresh form; saving keeps the form mounted", () => {
  assert.match(form, /<button type="button" disabled=\{busy\} onClick=\{onDiscard\}[^>]*>\{t\("agents\.profile\.discard"\)\}<\/button>/);
  assert.match(form, /onSaved\(data\.agent\);\s*\} catch/);
});

test("sub-dialogs are portaled to the body, above the sidebar", () => {
  assert.match(form, /createPortal\(\s*<>\s*\{rotated\[0\] && \(/);
  assert.match(form, /document\.body,\s*\)\}/);
});
```

- [ ] **Step 2: Run it, expect FAIL** (file missing).
- [ ] **Step 3: `git mv components/agents/AgentProfileDialog.tsx components/agents/AgentProfileForm.tsx`, then edit:**
  - Signature: `export function AgentProfileForm({ agent, onSaved, onDeleted, onThreadReset, onDiscard }: { agent: AgentDetail; onSaved: (agent: AgentDetail) => void; onDeleted: () => void; onThreadReset: () => void; onDiscard: () => void }) {`
  - Delete `dialogRef`, `onCloseRef` and the `openStackedDialog` effect; drop `openStackedDialog` and `backdropStyle, formStyle` from the imports.
  - `submit`: delete `onClose();` after `onSaved(data.agent);`.
  - `remove`: delete `onClose();` after `onDeleted();`.
  - `quarantine`: replace `if (data.secrets?.length) setRotated(data.secrets);\n      else onClose();` with `if (data.secrets?.length) setRotated(data.secrets);`.
  - Reset button: `onClick={() => { onThreadReset(); onClose(); }}` → `onClick={onThreadReset}`.
  - Cancel button → `<button type="button" disabled={busy} onClick={onDiscard} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("agents.profile.discard")}</button>`.
  - Remove `if (typeof document === "undefined") return null;`. Replace the returned tree with:

```tsx
  return (
    <>
      <form className="agent-profile-form" aria-label={title} onSubmit={(event) => void submit(event)}>
        {/* the existing children of the old <form>, minus the <strong>{title}</strong> line */}
      </form>
      {typeof document !== "undefined" && createPortal(
        <>
          {rotated[0] && (
            <TriggerSecretDialog
              key={rotated[0].triggerId}
              triggerId={rotated[0].triggerId}
              triggerName={rotated[0].name}
              secret={rotated[0].webhookSecret}
              onClose={() => setRotated(rotated.slice(1))}
            />
          )}
          {curation && agent.memorySnapshotPath && (
            <TriggerDialog
              agentName={agent.name}
              prefill={{ name: "Memory curation", everyMinutes: 7 * 24 * 60, runTarget: "thread", promptTemplate: curationPrompt(agent.name, agent.memorySnapshotPath) }}
              onClose={() => setCuration(false)}
              onSaved={() => setCuration(false)}
            />
          )}
        </>,
        document.body,
      )}
    </>
  );
```

  - CSS in `app/globals.css` next to `.agent-space-section`: `.agent-profile-form { display: grid; gap: 10px; padding: 10px 10px 16px; }`.
  - i18n `agents.profile.discard`: en "Discard changes", fr "Annuler les modifications", zh-CN "放弃更改", zh-TW "捨棄變更".
  - `AgentSpaceLeft.tsx` (temporary until Task 3): import `AgentProfileForm`; replace `{profileOpen && <AgentProfileDialog … />}` with `{profileOpen && <AgentProfileForm key={formKey} agent={agent} onSaved={onProfileSaved} onDeleted={onDeleted} onThreadReset={onThreadReset} onDiscard={() => setFormKey((key) => key + 1)} />}` and add `const [formKey, setFormKey] = useState(0);`.
- [ ] **Step 4: Rewrite the tests pinning the old file name** (same intent): `AgentSpace.test.mjs:6` reads `./AgentProfileForm.tsx` (variable `dialog` → `form`, test names say "AgentProfileForm"); `AgentSpace.test.mjs:15` `<AgentProfileDialog` → `<AgentProfileForm`; `toasts.test.mjs:6`, `polish-settings-files.test.mjs:7` read `AgentProfileForm.tsx`; `route.test.mjs:78` and `PromptChips.test.mjs:46` list `"AgentProfileForm"` / `"AgentProfileForm.tsx"`.
- [ ] **Step 5: Run** the six test files, `tsc`, lint. Expect PASS.
- [ ] **Step 6: Commit** `feat(agents): the agent profile becomes an inline form` (body: rewritten assertions = file renames only).

---

### Task 3: `AgentSidebar`

**Files:**
- Create: `components/agents/AgentSidebar.tsx`
- Delete: `components/agents/AgentSpaceLeft.tsx`
- Test: create `components/agents/AgentSidebar.test.mjs`; rewrite `components/agents/AgentSpace.test.mjs:4,9-19` (the `left` test)
- i18n: `agents.sidebar.{tabsLabel,files,triggers,settings,status,newTask}` in 4 locales

**Interfaces:**
- Consumes: Task 1 `AgentSidebarTab`, `loadAgentSidebarTab`, `saveAgentSidebarTab`; Task 2 `AgentProfileForm`; `QueueTaskDialog({ agentName, onClose, onQueued })`; `AgentTriggers({ agentName, triggers, tasks, onOpenSession, onChanged })`; `FileExplorer` (`ref: FileExplorerHandle { openUploadPicker() }`, props `cwd, onOpenFile, refreshKey, onUploadBusyChange, changesCollapsed, fileSearchOpen, onFileSearchOpenChange`).
- Produces: `export function AgentSidebar(props: { agent: AgentDetail; isMobile: boolean; status: ReactNode; onOpenFile: ComponentProps<typeof FileExplorer>["onOpenFile"]; onOpenTerminal: (cwd: string) => void; onOpenSession: (sessionId: string) => void; onProfileSaved: (agent: AgentDetail) => void; onDeleted: () => void; onThreadReset: () => void })`.

- [ ] **Step 1: Write the failing test** — `components/agents/AgentSidebar.test.mjs`:

```js
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
  assert.equal((source.match(/<FileExplorer/g) ?? []).length, 1);
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
```

- [ ] **Step 2: Run it, expect FAIL** (module missing).
- [ ] **Step 3: Implement `components/agents/AgentSidebar.tsx`:**

```tsx
"use client";

import { type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, SlidersHorizontal, Zap } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import type { AgentDetail } from "@/lib/agents/agent-view";
import { loadAgentSidebarTab, saveAgentSidebarTab, type AgentSidebarTab } from "@/lib/agents/drawer-tab";
import { FileExplorer, type FileExplorerHandle } from "../FileExplorer";
import { CheckIcon, FolderIcon, PlusIcon, RefreshIcon, SearchIcon, TerminalIcon, UploadIcon } from "../SidebarIcons";
import { AgentProfileForm } from "./AgentProfileForm";
import { AgentTriggers } from "./AgentTriggers";
import { QueueTaskDialog } from "./QueueTaskDialog";

const TRIGGERS_POLL_MS = 10_000;

interface FileManagerAvailability { supported: boolean; reason: string | null; platform: string }

/** Copy of SessionSidebar's private useHeaderFit (upstream file left untouched): data-fit 0/1/2 drops labels to icons. */
function useHeaderFit(ref: RefObject<HTMLElement | null>, labels: string): void {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const fit = () => {
      for (const level of ["0", "1", "2"]) {
        header.dataset.fit = level;
        if (header.scrollWidth <= header.clientWidth) return;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header);
    return () => observer.disconnect();
  }, [ref, labels]);
}

export function AgentSidebar({ agent, isMobile, status, onOpenFile, onOpenTerminal, onOpenSession, onProfileSaved, onDeleted, onThreadReset }: {
  agent: AgentDetail;
  isMobile: boolean;
  /** The right panel's content, shown as a Status tab on phones only. */
  status: ReactNode;
  onOpenFile: ComponentProps<typeof FileExplorer>["onOpenFile"];
  onOpenTerminal: (cwd: string) => void;
  onOpenSession: (sessionId: string) => void;
  onProfileSaved: (agent: AgentDetail) => void;
  onDeleted: () => void;
  onThreadReset: () => void;
}) {
  const { t } = useI18n();
  const name = agent.name;
  const tabs: AgentSidebarTab[] = isMobile ? ["files", "triggers", "settings", "status"] : ["files", "triggers", "settings"];
  const [tab, setTab] = useState<AgentSidebarTab>(() => loadAgentSidebarTab(isMobile));
  const tabRefs = useRef<Partial<Record<AgentSidebarTab, HTMLButtonElement | null>>>({});
  const headerRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<FileExplorerHandle>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [explorerKey, setExplorerKey] = useState(0);
  const [refreshDone, setRefreshDone] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [fileManager, setFileManager] = useState<FileManagerAvailability | null>(null);
  const [triggers, setTriggers] = useState<PublicTrigger[]>([]);
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);

  // A phone turned desktop loses its Status tab.
  useEffect(() => { if (!isMobile && tab === "status") setTab("files"); }, [isMobile, tab]);

  const switchTab = useCallback((next: AgentSidebarTab) => {
    setTab(next);
    saveAgentSidebarTab(next);
  }, []);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === "Home" ? tabs[0]
      : event.key === "End" ? tabs[tabs.length - 1]
      : tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    switchTab(next);
    tabRefs.current[next]?.focus();
  };

  // Triggers and their tasks: independent reads, a failing one keeps the last list.
  const load = useCallback(async (signal?: AbortSignal) => {
    const read = async <T,>(url: string, key: string): Promise<T | null> => {
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        const data = await response.json() as Record<string, unknown>;
        return response.ok && Array.isArray(data[key]) ? data[key] as T : null;
      } catch { return null; }
    };
    const [nextTriggers, nextTasks] = await Promise.all([
      read<PublicTrigger[]>(`/api/agent-ops/triggers?agent=${encodeURIComponent(name)}`, "triggers"),
      read<AgentTaskListItem[]>(`/api/agents/${encodeURIComponent(name)}/tasks`, "tasks"),
    ]);
    if (signal?.aborted) return;
    if (nextTriggers) setTriggers(nextTriggers);
    if (nextTasks) setTasks(nextTasks);
  }, [name]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), TRIGGERS_POLL_MS);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/open-in-explorer")
      .then((res) => res.ok ? res.json() as Promise<FileManagerAvailability> : null)
      .then((data) => { if (!cancelled && data) setFileManager(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const openInFileManager = async () => {
    try {
      const res = await fetch("/api/open-in-explorer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd: agent.home }) });
      if (res.ok) return;
      const data = await res.json().catch(() => ({})) as { error?: string };
      toast.error(data.error ?? `HTTP ${res.status}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  const fileManagerUnavailable = fileManager?.supported === false;
  const fileManagerLabel = t(fileManager?.platform === "darwin" ? "sidebar.openInFinder" : fileManager?.platform === "win32" ? "sidebar.openInExplorer" : "sidebar.openInFileManager");

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); }, []);
  const refresh = () => {
    setExplorerKey((key) => key + 1);
    setRefreshDone(true);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setRefreshDone(false), 2000);
  };

  const labels: Record<AgentSidebarTab, string> = {
    files: t("agents.sidebar.files"), triggers: t("agents.sidebar.triggers"), settings: t("agents.sidebar.settings"), status: t("agents.sidebar.status"),
  };
  const icons: Record<AgentSidebarTab, ReactNode> = {
    files: <FolderIcon size={13} className="sidebar-tab-icon" />,
    triggers: <Zap size={13} aria-hidden="true" className="sidebar-tab-icon" />,
    settings: <SlidersHorizontal size={13} aria-hidden="true" className="sidebar-tab-icon" />,
    status: <Activity size={13} aria-hidden="true" className="sidebar-tab-icon" />,
  };
  useHeaderFit(headerRef, [...tabs.map((id) => labels[id]), t("agents.sidebar.newTask"), tab].join("\n"));

  const tool = (title: string, onClick: () => void, icon: ReactNode, disabled = false, done = false) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`sidebar-tool-button${done ? " is-done" : ""}`}>{icon}</button>
  );

  return (
    <div className="session-sidebar agent-sidebar">
      <div ref={headerRef} className="sidebar-header">
        <div className="sidebar-tabs-list" role="tablist" aria-label={t("agents.sidebar.tabsLabel")}>
          {tabs.map((id) => (
            <button
              key={id}
              ref={(element) => { tabRefs.current[id] = element; }}
              type="button"
              role="tab"
              id={`agent-sidebar-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`agent-sidebar-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={`sidebar-tab${tab === id ? " is-selected" : ""}`}
              onClick={() => switchTab(id)}
              onKeyDown={handleTabKeyDown}
            >
              {icons[id]}
              <span className="sidebar-tab-label">{labels[id]}</span>
            </button>
          ))}
        </div>
        <span className="sidebar-header-spacer" />
        <button type="button" className="sidebar-new-button" onClick={() => setQueueOpen(true)} title={t("agents.sidebar.newTask")}>
          <PlusIcon size={12} />
          <span className="sidebar-new-label">{t("agents.sidebar.newTask")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (tab !== "files") {
              switchTab("files");
              setFileSearchOpen(true);
              return;
            }
            setFileSearchOpen((open) => !open);
          }}
          title={t("sidebar.searchFiles")}
          aria-label={t("sidebar.searchFiles")}
          aria-expanded={fileSearchOpen}
          className={`sidebar-search-toggle${fileSearchOpen ? " is-active" : ""}`}
        >
          <SearchIcon size={16} />
        </button>
      </div>

      <div id="agent-sidebar-panel-files" role="tabpanel" aria-labelledby="agent-sidebar-tab-files" hidden={tab !== "files"} className="sidebar-panel">
        <div className="sidebar-files-head">
          <div className="sidebar-files-actions" role="group" aria-label={t("sidebar.fileActions")}>
            {tool(t("terminal.open"), () => onOpenTerminal(agent.home), <TerminalIcon size={14} />)}
            {tool(fileManagerUnavailable ? t(fileManager?.reason === "remote" ? "sidebar.openInExplorerRemoteOnly" : "sidebar.openInExplorerUnsupported") : fileManagerLabel, () => { void openInFileManager(); }, <FolderIcon size={14} />, fileManagerUnavailable)}
            {tool(t("sidebar.uploadFilesTitle"), () => explorerRef.current?.openUploadPicker(), <UploadIcon size={14} />, uploadBusy)}
            {tool(t("sidebar.refreshExplorer"), refresh, refreshDone ? <CheckIcon size={14} /> : <RefreshIcon size={14} />, false, refreshDone)}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <FileExplorer
            ref={explorerRef}
            cwd={agent.home}
            onOpenFile={onOpenFile}
            refreshKey={explorerKey}
            onUploadBusyChange={setUploadBusy}
            changesCollapsed
            fileSearchOpen={fileSearchOpen}
            onFileSearchOpenChange={setFileSearchOpen}
          />
        </div>
      </div>

      <div id="agent-sidebar-panel-triggers" role="tabpanel" aria-labelledby="agent-sidebar-tab-triggers" hidden={tab !== "triggers"} className="sidebar-panel agent-sidebar-scroll">
        <AgentTriggers agentName={name} triggers={triggers} tasks={tasks} onOpenSession={onOpenSession} onChanged={() => void load()} />
      </div>

      <div id="agent-sidebar-panel-settings" role="tabpanel" aria-labelledby="agent-sidebar-tab-settings" hidden={tab !== "settings"} className="sidebar-panel agent-sidebar-scroll">
        <AgentProfileForm key={formKey} agent={agent} onSaved={onProfileSaved} onDeleted={onDeleted} onThreadReset={onThreadReset} onDiscard={() => setFormKey((key) => key + 1)} />
      </div>

      {isMobile && (
        <div id="agent-sidebar-panel-status" role="tabpanel" aria-labelledby="agent-sidebar-tab-status" hidden={tab !== "status"} className="sidebar-panel agent-sidebar-scroll">
          {status}
        </div>
      )}

      {queueOpen && typeof document !== "undefined" && createPortal(<QueueTaskDialog agentName={agent.name} onClose={() => setQueueOpen(false)} onQueued={() => setQueueOpen(false)} />, document.body)}
    </div>
  );
}
```

  - CSS (`app/globals.css`, beside `.agent-space-section`): `.agent-sidebar-scroll { overflow-y: auto; padding: 8px; }`. Hidden panels need no rule: Tailwind v4's preflight sets `[hidden] { display: none !important }`, which is how the session sidebar's `.sidebar-panel[hidden]` hides too.
  - i18n `agents.sidebar.*`: en tabsLabel "Agent sidebar view", files "Files", triggers "Triggers", settings "Settings", status "Status", newTask "Task"; fr "Vue de la barre de l'agent", "Fichiers", "Déclencheurs", "Réglages", "Statut", "Tâche"; zh-CN "代理侧栏视图", "文件", "触发器", "设置", "状态", "任务"; zh-TW "代理側欄檢視", "檔案", "觸發器", "設定", "狀態", "任務".
  - `git rm components/agents/AgentSpaceLeft.tsx`. `AppShell.tsx` still imports it: switch the import and the `agentSpaceLeft` element now (Task 4 does the rest):

```tsx
import { AgentSidebar } from "./agents/AgentSidebar";
…
  const agentSpaceLeft = activeAgent && agentDetail ? (
    <AgentSidebar
      key={agentDetail.name}
      agent={agentDetail}
      isMobile={isMobile}
      status={agentSpaceRight}
      onOpenFile={handleOpenFile}
      onOpenTerminal={handleOpenTerminal}
      onOpenSession={(sessionId) => void handleOpenSession(sessionId)}
      onProfileSaved={(agent) => { setAgentDetail(agent); reloadAgents(); }}
      onDeleted={handleAgentDeleted}
      onThreadReset={() => void resetAgentThread(agentDetail.name)}
    />
  ) : null;
```

  Move the `agentSpaceRight` declaration above `agentSpaceLeft` (it is now a prop). `handleOpenTerminal` is `(cwd: string) => void` (`components/AppShell.tsx:1279`).
- [ ] **Step 4: Rewrite `AgentSpace.test.mjs`'s left test** (same intent, new component): read `./AgentSidebar.tsx` as `left`; test "AgentSidebar mounts the home explorer, the profile form and the triggers":

```js
  assert.match(left, /<FileExplorer\s+ref=\{explorerRef\}\s+cwd=\{agent\.home\}/);
  assert.match(left, /onUploadBusyChange=\{setUploadBusy\}/);
  assert.match(left, /explorerRef\.current\?\.openUploadPicker\(\)/);
  assert.match(left, /<AgentProfileForm key=\{formKey\}/);
  assert.match(left, /\/api\/agent-ops\/triggers\?agent=\$\{encodeURIComponent\(name\)\}/);
  assert.match(left, /<AgentTriggers agentName=\{name\}/);
```

  and the AppShell assertion `activeAgent && agentDetail \? \(?\s*<AgentSpaceLeft` → `activeAgent && agentDetail \? \(?\s*<AgentSidebar`. Deleted: `agents.space.browse`, `agents.space.triggers` (labels moved to the tabs), `disabled=\{uploadBusy\}` (now an argument of `tool(…)`).
- [ ] **Step 5: Run** `AgentSidebar.test`, `AgentSpace.test`, i18n tests, `tsc`, lint. Expect PASS.
- [ ] **Step 6: Commit** `feat(agents): agent sidebar with Files, Triggers and Settings tabs` (body lists the rewritten/deleted assertions).

---

### Task 4: AppShell — drop the phone drawer tabs

**Files:**
- Modify: `components/AppShell.tsx:21,1532-1547,1574-1585` (drawer tab state, `selectDrawerTab`, the `sidebarContent` agent branch)
- Modify: `app/globals.css:2321-2323` (`.agent-drawer-tab*` rules, and their `@media (max-width: 640px)` wrapper if it becomes empty)
- Modify: `lib/agents/drawer-tab.ts` (remove the deprecated exports from Task 1)
- Test: `components/MobilePwaLayout.test.mjs:126-129`; new assertions in `components/agents/AgentSidebar.test.mjs`
- i18n: remove keys nothing reads any more (`agents.space.home`, `agents.space.browse`, `agents.space.profile`, `agents.drawer.*`) after `rg -n '"agents\.(space\.(home|browse|profile|triggers)|drawer\.)' components lib app hooks` shows no reader.

- [ ] **Step 1: Write the failing test** — append to `components/agents/AgentSidebar.test.mjs`:

```js
test("AppShell: the agent sidebar replaces the phone drawer tabs and is keyed by agent", async () => {
  const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /<AgentSidebar\s+key=\{agentDetail\.name\}/);
  assert.match(shell, /const sidebarContent = agentSpaceLeft \?\? \(/);
  assert.doesNotMatch(shell, /agent-drawer-tab|drawerTab|DRAWER_TAB_KEY/);
});
```

  Rewrite `MobilePwaLayout.test.mjs` "the agent drawer tab header is styled under 640px" → "the agent drawer tabs are gone (the agent sidebar's Status tab replaces them)": `assert.doesNotMatch(cssSource, /agent-drawer-tab/);`.
- [ ] **Step 2: Run both, expect FAIL.**
- [ ] **Step 3: Implement:**
  - `AppShell.tsx`: delete the `drawerTab` state, its load effect and `selectDrawerTab`; delete the `DRAWER_TAB_KEY, readDrawerTab, type DrawerTab` import; replace the agent branch with `const sidebarContent = agentSpaceLeft ?? (` keeping the existing session branch (`<>…<SessionSidebar …/>…</>`) as its operand and closing with `);`.
  - `globals.css`: delete the three `.agent-drawer-tab*` rules (and the now-empty media block if any).
  - `drawer-tab.ts`: delete the deprecated `DrawerTab`, `DRAWER_TAB_KEY`, `readDrawerTab`.
  - Prune the unused i18n keys in the 4 locales.
- [ ] **Step 4: Run** the two tests, `lib/agents/drawer-tab.test.mjs`, i18n tests, `tsc`, lint, then the full suite. Expect 0 failures.
- [ ] **Step 5: Commit** `feat(agents): the agent sidebar's Status tab replaces the phone drawer tabs` (body: MobilePwaLayout assertion rewritten; removed keys listed).

---

### Task 5: Tron check, docs, gate, review

**Files:**
- Modify: `components/sidebar-tron.test.mjs` (add `agentSidebar: await read("./agents/AgentSidebar.tsx")` and `profileForm: await read("./agents/AgentProfileForm.tsx")` to `sources`)
- Modify: `docs/agents/long-term-agents.md` (agent space section: the sidebar, its tabs, inline profile form), `AGENTS.md` file map (`components/agents/*` line: AgentSidebar, AgentProfileForm instead of AgentSpaceLeft/AgentProfileDialog) — stage only those hunks, never the `nextjs-agent-rules` block.

- [ ] **Step 1:** Extend `sidebar-tron.test.mjs`; run it. Fix any off-palette literal it finds in the two files (expected: `AgentProfileForm` buttons use tokens already; replace any hex/rgba other than black/white/tron hues with a `var(--color-tron-*)`).
- [ ] **Step 2:** Update the two docs.
- [ ] **Step 3:** Full gate: `tsc`, lint, full `npm test` → 0 failures.
- [ ] **Step 4:** Commit `docs(agents): agent sidebar notes; Tron palette check covers it`.
- [ ] **Step 5:** Fresh review subagent (`claude-bridge/claude-opus-5-5:high`) on `git diff local...feat/agent-sidebar`, focused on the Review Focus list; fix Critical/Important test-first.
- [ ] **Step 6:** Push `feat/agent-sidebar` to `origin`; ask the user for a visual check on port 30141 (desktop and phone width: each tab, + Task, Search, upload, Settings save / discard / delete confirm, Status tab on a phone).
- [ ] **Step 7:** After approval: `git switch local && git merge --ff-only feat/agent-sidebar && git push origin local`, delete the branch locally and on `origin`.
