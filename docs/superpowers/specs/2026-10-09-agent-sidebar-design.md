# Agent sidebar — design

Date: 2026-10-09 · Branch: `feat/agent-sidebar` (from `local` = `811a4d2`)

## Goal

The agent view's left column looks and behaves like the session sidebar. Today it is a
one-off column (`components/agents/AgentSpaceLeft.tsx`): avatar header, "Home" label with an
upload icon, file tree, triggers, and a "Profile" button that opens a dialog. It becomes a
sidebar with the session sidebar's toolbar row, tabs and Tron look.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Sessions tab | None in agent mode. The agent keeps its single thread in the chat column. |
| Tabs | **Files** (the agent's home) · **Triggers** · **Settings** (the profile). |
| Settings tab | The profile form inline, not a dialog. |
| Header | The avatar / name / model header is removed: the rail and the top bar already show the agent. |
| Toolbar buttons | **+ Task** (opens `QueueTaskDialog` for this agent) and **Search** (searches the home's files). |
| Approach | A new `AgentSidebar` that reuses the session sidebar's markup and CSS classes. `SessionSidebar.tsx` (upstream) is not modified, so upstream syncs do not conflict there. |

Rejected:
- a `mode="agent"` in `SessionSidebar` (deep change to a 2 300-line upstream file);
- extracting the upstream tab bar into a shared component (structural change to an upstream file
  for ~40 duplicated lines).

## Layout

```
┌ toolbar row (.sidebar-header) ──────────────────────────────┐
│ [📁 FILES] [⚡ TRIGGERS] [⚙ SETTINGS] [◉ STATUS]*   [+] [🔍] │
└─────────────────────────────────────────────────────────────┘
  Files     : .sidebar-files-head actions → FileExplorer(agent.home)
  Triggers  : AgentTriggers
  Settings  : AgentProfileForm (inline)
  Status*   : AgentSpaceRight — phones only (the right panel is hidden there)
```

## Components

**`components/agents/AgentSidebar.tsx`** (new): replaces `AgentSpaceLeft`.
- Props: `agent`, `isMobile`, `onOpenFile`, `onOpenTerminal`, `onOpenSession`, `onProfileSaved`,
  `onDeleted`, `onThreadReset`, and `status: ReactNode` (the phone-only Status tab content).
- Toolbar row: the session sidebar's classes (`sidebar-header`, `sidebar-tabs-list`,
  `sidebar-tab`, `sidebar-tab-icon`, `sidebar-tab-label`, `sidebar-header-spacer`,
  `sidebar-new-button`, `sidebar-search-toggle`), so `sidebar.css` and `sidebar-tron.css` style
  it with no new CSS beyond what the tab count needs.
- Tabs: `role="tablist"` / `role="tab"` with `aria-selected`, `aria-controls`, roving `tabIndex`;
  ArrowLeft/ArrowRight cycle, Home/End jump, as in the session sidebar. Panels are
  `role="tabpanel"` with `hidden`, kept mounted so the file tree, its search and an upload in
  progress survive a tab switch.
- **+ Task** (`sidebar-new-button`, label "Task"): opens `QueueTaskDialog` with `agentName`.
- **Search** (`sidebar-search-toggle`): toggles the file search; from another tab it switches to
  Files first and opens it.

**Files panel:** `.sidebar-files-head` with `.sidebar-files-actions` (`sidebar-tool-button`):
open a terminal in the home, open the home in the OS file manager when available (same
`/api/open-in-explorer` check as the session sidebar), upload, refresh. No project/worktree
picker. Below it, `FileExplorer` on `agent.home` with `fileSearchOpen` driven by the toolbar.

**Triggers panel:** `AgentTriggers` unchanged.

**Settings panel:** `AgentProfileForm`.

**`components/agents/AgentProfileForm.tsx`** (from `AgentProfileDialog.tsx`): the form body,
inline. Same fields, validation, save, thread reset, delete (with its confirmation), secret
rotation and memory curation sub-dialogs. "Cancel" becomes "Discard changes": it resets the
fields to the saved profile and is disabled while nothing changed. No backdrop, no
`openStackedDialog`. `AgentProfileDialog.tsx` and `AgentSpaceLeft.tsx` are deleted (their only
caller was `AgentSpaceLeft`).

**Tab memory:** `lib/agents/drawer-tab.ts` becomes the agent sidebar tab store:
`AgentSidebarTab = "files" | "triggers" | "settings" | "status"`, key `pi-agent-sidebar-tab`,
default `files`. A stored `status` on desktop reads as `files`. The old key
`pi-agent-drawer-tab` is ignored.

**AppShell:** `agentSpaceLeft` renders `AgentSidebar`; the mobile `agent-drawer-tabs` block and
its CSS go (the Status tab replaces them). On desktop the right panel keeps `AgentSpaceRight`.

## Behavior details

- Switching agents keeps the selected tab; the Settings form reloads for the new agent and drops
  unsaved edits.
- Saving the Settings form while the thread runs keeps today's rule: the server refuses
  (`canEditProfile`, 409) and the form shows `agents.profile.running`. Quarantine stays beside
  delete and reset.
- Narrow sidebar: the session sidebar's `data-fit` rules (`app/sidebar.css`) hide labels when
  they do not fit. `useHeaderFit` is private to `SessionSidebar.tsx`, so `AgentSidebar` carries a
  copy (~15 lines, comment pointing to the original) rather than exporting it from the upstream
  file. With four tabs on a phone, labels drop to icons first.

## i18n

New keys in `en`, `fr`, `zh-CN`, `zh-TW`: `agents.sidebar.tabsLabel`, `agents.sidebar.files`,
`agents.sidebar.triggers`, `agents.sidebar.settings`, `agents.sidebar.status`,
`agents.sidebar.newTask`, `agents.profile.discard`. Keys only `AgentSpaceLeft` used
(`agents.space.home`, `agents.space.browse`, `agents.space.profile`, `agents.drawer.*`) are
removed if nothing else reads them.

## Testing

- `components/agents/AgentSidebar.test.mjs` (render + source): tab roles and ARIA wiring,
  ArrowLeft/Right/Home/End, Search switches to Files and opens the file search, + Task opens
  `QueueTaskDialog`, Status tab only when `isMobile`, panels stay mounted (`hidden`), the files
  head has the four actions and no project picker.
- `components/agents/AgentProfileForm.test.mjs`: inline (no `role="dialog"`, no backdrop),
  Discard resets and is disabled when unchanged, existing profile-dialog assertions carried over.
- `lib/agents/drawer-tab.test.mjs`: the new tab store (default, unknown value, `status` on
  desktop).
- `components/sidebar-tron.test.mjs` palette check extended to the new files.
- Existing tests pinning `AgentSpaceLeft`, `AgentProfileDialog` or `agent-drawer-tab`
  (`AgentSpace.test`, `MobilePwaLayout.test`, `polish-settings-files.test`, `toasts.test`,
  `app/api/agents/route.test`, `PromptChips.test`) are rewritten to the same intent; each
  deleted or rewritten assertion is listed in its commit body.
- Gate: `tsc --noEmit`, `npm run lint`, full `npm test` (via `env -i`), then a visual check by
  the user on port 30141.

## Out of scope

- A Sessions tab or any session list in agent mode.
- Changes to `SessionSidebar.tsx`, the agent rail or `AgentSpaceRight`'s desktop panel.
- Inline editing of trigger definitions beyond what `AgentTriggers` already does.
