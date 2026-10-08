# Tron UI — Lot 1d: Command palette and toasts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user).

**Goal:**
- A ⌘K / Ctrl+K command palette (`cmdk` in a Tron `Dialog`). It offers actions, Settings
  sections and jump-to-session.
- Tron toasts (`sonner`) that replace the blocking `window.alert()` calls in agent flows.

**Architecture:**
- `components/shell/CommandPalette.tsx` is presentational. It takes a flat list of
  `PaletteCommand` and has no app state.
- `AppShell` builds the list from handlers it already owns: `handleNewSession`,
  `handleSidebarToggle`, `handleRightPanelToggle`, `openShortcuts`, `openSettingsSection`,
  `handleSelectSession`, `sessionCatalog`.
- The key test lives next to `isShortcutsHelpKey` in `hooks/useKeyboardShortcuts.ts`.
- `<Toaster>` is mounted once in `AppShell`.

**Deps (exact):** `cmdk@1.1.1`, `sonner@2.0.8`. React 19 peers OK. Safari 16.4 OK.

**Spec:** [spec](../specs/2026-10-08-tron-ui-design.md), "New UI elements". Constraints are as in
[Lot 1a](2026-10-08-tron-ui-lot1a-frame.md).

**Scope note:** "switch model" from the palette is skipped. The model selector state lives inside
`ChatInput`, and there is no shell-level API for it. Add it when a ChatInput handle exists.

## Review Focus

1. **Ctrl+K typed inside the terminal (xterm)** must reach the shell, not open the palette. On mac
   only ⌘K opens it, so Ctrl+K stays the text-field "kill line". Pinned in Task 1, Step 1.
2. **IME composing, or a modifier combo with Alt/Shift:** does not open. Pinned in Task 1, Step 1.
3. **Project-only Settings sections without a project:** listed but disabled. Pinned in Task 1,
   Step 1.
4. **Selecting a command closes the palette before running it.** Focus goes back to the page,
   and Escape closes it without stopping the agent: Radix Dialog prevents default on Escape,
   which the global handler respects. Pinned in Task 1, Step 1 (source) and reasoned in review.
5. **Error alerts are no longer blocking** but still visible and announced: sonner uses an
   `aria-live` region. Pinned in Task 2, Step 1.

---

### Task 1: Command palette

**Files:**
- Create: `components/shell/CommandPalette.tsx`
- Modify: `hooks/useKeyboardShortcuts.ts` (`isCommandPaletteKey`)
- Modify: `components/AppShell.tsx` (state, key listener, command list, render)
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (`palette.*` keys)
- Test: create `components/shell/command-palette.test.mjs`

**Interfaces:**
```ts
export type PaletteGroup = "actions" | "settings" | "sessions";
export type PaletteCommand = { id: string; group: PaletteGroup; label: string; hint?: string; disabled?: boolean; run: () => void };
export function CommandPalette(props: { open: boolean; onOpenChange: (open: boolean) => void; commands: PaletteCommand[] }): JSX.Element;
export function isCommandPaletteKey(event: KeyboardEvent, platform: "mac" | "other"): boolean;
```

**i18n keys** (all 4 locales):
`palette.title`, `palette.placeholder`, `palette.empty`, `palette.groupActions`,
`palette.groupSettings`, `palette.groupSessions`, `palette.newSession`, `palette.toggleSidebar`,
`palette.toggleFiles`.

**Steps:**
1. **Failing tests:**
   - `isCommandPaletteKey`:
     - mac: ⌘K → true; Ctrl+K → false
     - other: Ctrl+K → true
     - Alt or Shift held → false
     - `isComposing` → false
     - a target inside `.terminal-xterm` → false
     - an already `defaultPrevented` event → false
   - `CommandPalette` (static render with `open`; Radix portals do not render in SSR, so test the
     source):
     - `Command.Item` gets `disabled={command.disabled}`
     - `onSelect` calls `onOpenChange(false)` before `command.run()`
   - `AppShell`:
     - builds Settings commands with `disabled: settingsSectionRequiresProject(section) && !projectTrustCwd`
     - renders `<CommandPalette`
     - listens with `isCommandPaletteKey`
   - i18n: each locale has every `palette.*` key.
2. **Run** → FAIL.
3. **Implement:**
   - Install the deps.
   - Write the component. Tron classes: input `font-mono`, `cmdk-group-heading` in `font-hud`,
     selected item with a cyan inset trace + gradient, 44 px on coarse pointers.
   - Add the key listener in `AppShell` with `useShortcutPlatform`.
   - Build the command list with `useMemo`.
   - Add the i18n keys.
4. **Run** → PASS. Then `tsc` and lint. **Commit:**
   `feat(ui): command palette (Cmd/Ctrl+K): actions, settings sections, jump to session`.

### Task 2: Tron toasts replace blocking alerts

**Files:**
- Modify: `components/AppShell.tsx` (mount `<Toaster>`; five `window.alert` → `toast.error`)
- Modify: `components/agents/AgentProfileDialog.tsx` (two `window.alert` → `toast.warning`)
- Test: create `components/shell/toasts.test.mjs`

**Steps:**
1. **Failing test:**
   - no `window.alert(` in `AppShell.tsx` or `AgentProfileDialog.tsx`
   - `AppShell` renders `<Toaster` with `theme="dark"` and Tron `classNames`
     (`toast: …border-tron-line…`)
2. **Run** → FAIL.
3. **Implement.** Replace each alert with `toast.error(sameMessage)` or `toast.warning(…)`. The
   control flow is unchanged: the `return;` after the 409 alert stays.
4. **Run** → PASS. Then `tsc` and lint. **Commit:**
   `feat(ui): Tron toasts replace blocking agent alerts`.

### Task 3: Gate and review

- **Full gate:** 0 failures.
- **Review** on `claude-bridge/claude-opus-5-5:high`.
- **One fix pass** (TDD). Minors go to the ledger.
- **User visual check:**
  - ⌘K / Ctrl+K: search, select a session, open a Settings section
  - Ctrl+K inside the terminal
  - trigger an agent error toast
