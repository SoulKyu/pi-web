# Sync upstream `76bdc57` — progress

Branch `sync/upstream-76bdc57` from `local` = `a507131`. Upstream range `a096af3..76bdc57` (20 commits).
Decision (human): option 1 — adopt the upstream sidebar, reapply fork contributions, restyle it Tron.
Rollback: `git reset --hard a507131` on `local` while nothing is pushed there.

## Steps

- [x] 4.1 prepare: fetch, `local` clean and pushed
- [x] 4.2 merge `upstream/main` (no-ff) → `3be73b0`
- [x] resolve conflicts (list below; details in the merge commit body)
- [x] fonts (#1074): kept; defaults = Tron fonts via `--font-ui-default`/`--font-mono-default`; no theme plumbing
- [x] merge commit + gate: tsc OK, lint OK, 3548 pass / 20 fail / 1 skipped (failures listed below)
- [x] fork contributions on the new sidebar (inventory below), each with a failing test first
- [x] Origin check on new routes: already enforced (`isApiRequestAllowed`); tests send Origin + pin the refusal (`c2313bb`)
- [x] Tron pass: `554bd60` (sidebar, menus, toast, pickers), `956b230` (Bot glyph), `a96cd24` (font placeholders)
- [x] gate after each Tron commit (3575 pass / 0 fail / 1 skipped at `554bd60`)
- [x] 4.4 final checks: 482 files differ (344 A, 133 M, 5 D = theme plumbing); no fork file back to upstream; only session-sidebar-tron.test gone (replaced)
- [x] Opus review: 0 critical; 2 important fixed test-first (`9725e7b` arrow onto delete-confirm row, `3991cbd` agent profile carried); minors `2596e5c`, `e0387ed`; gate 3577 pass / 0 fail / 1 skipped
  - open minors (report): SidebarMenu capture keydown swallows modified arrows while a menu is open (upstream code); `npm start` (fork, 0.0.0.0) skips bin/rotate-preview-secrets.js — start through bin/pi-web.js
- [x] push `sync/upstream-76bdc57` to origin, ask human visual check
- [ ] 4.5 ff-only into `local`, push, delete sync branch
- [x] `AGENT.md` §7 + §8 (on the sync branch) · [ ] report §9

## Conflicts

All 19 resolved in `3be73b0`:
- [x] AGENTS.md · [x] app/globals.css · [x] AppShell.tsx · [x] AppShell.mobile-toolbar.test.mjs
- [x] ChatInput.tsx · [x] ChatInput.test.mjs · [x] ChatWindow.tsx · [x] FileExplorer.tsx · [x] FileViewer.tsx
- [x] MermaidBlock.tsx · [x] SessionSidebar.tsx (upstream) · [x] SessionSidebar.test.mjs (upstream)
- [x] SettingsPanel.tsx · [x] SettingsPanel.test.mjs · [x] useAgentSession.ts · [x] i18n en/zh-CN/zh-TW (+ fr.ts) · [x] session-reader.ts

Failures after the merge (20), each owned by a follow-up commit:
- [x] ui-state + fork route tests (12) `c2313bb`: no `Origin` header (fork `request-security`) → fix(fork)
- [x] NewSessionContextBar.test `9fe1bcf`: fork find bar sits between hero and composer → fix(fork)
- [x] shortcut-label.test `a6c64ee`: New session Ctrl+Alt+N hint → contribution C10
- [x] session-sidebar-tron.test, polish-frame.test → `554bd60`
- [x] tron-settings.test → `554bd60`

Follow-ups noted:
- AgentSessionPanel robot glyph → lucide Bot (Tron), restore its SettingsPanel.test assertion
- font placeholders mention Noto Sans Mono / System default → Tron fonts
- agentProfile not carried with model/reasoning across a new-session project switch (minor, report)
- old-sidebar i18n keys now unused (minor, prune or report)

## Fork contributions on the sidebar

Inventory (sub-agent, 2026-10-08). Reapply test-first on the new components:
- [x] C1 row label — covered: the row is a <button> whose name holds title, branch and the running/unread meta labels
- [x] `3344082` C2 ArrowUp/Down row focus, modifier+arrows left to rail shortcuts — 648fc0c/01fbdec — no → SessionTree
- [x] `3344082` C3 F2 rename, Delete/Backspace opens confirm on focused row — 648fc0c/01fbdec — partial (menu letters) → SessionTree
- [x] C5 keyboard-safe delete confirm, focus return — covered upstream (SidebarMenu, pendingFocusRef)
- [x] C6 row actions on focus-visible — covered upstream (sidebar.css :has(:focus-visible))
- [x] C7 coarse-pointer ⋯ — covered upstream (is-mobile more action)
- [x] `efa316d` C8 search Escape: clear, then close + refocus toggle — 5dff310 — partial → SessionSidebar search
- [x] C9 live phase label, pause confirm — AgentRail (fork-only component), untouched
- [x] `a6c64ee` C10 Ctrl+Alt+N hint on New session (title, aria-keyshortcuts) — 06b473c — no → SessionSidebar
- [x] C11 robot glyph on child rows — dead code in the fork (depth never passed); skipped
- [x] `7ac8087` C12 rename/delete HTTP failures surfaced — 648fc0c — no → SessionSidebar (SidebarToast)
- [x] C13 — covered: RenameInput selects on mount, doneRef blocks the double commit; the relatedTarget guard served row state upstream replaced by CSS
