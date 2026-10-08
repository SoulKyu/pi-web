# Tron UI — Lot 2: Settings and dialogs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user).

**Goal:** Bring Settings (all sections), the agent dialogs and panels, the project-trust,
shortcuts, directory-picker and image-preview dialogs, and the login page into the Tron identity:
- square corners
- Tron colors only
- glowing dialog surfaces
- HUD headings
- lucide section icons

**Architecture:** these screens are styled mostly by shared sources, so the lot works on those
first:
- `app/settings.css` (every Settings section, through `SettingsUi` classes)
- `components/agents/dialog-styles.ts` (every agent dialog)
- `app/globals.css` (agent panels, login)

**Codemod.** A one-shot script (`/tmp/tron-sweep.mjs`, not committed) maps off-palette colors to
tokens and small radii to 0. Dry run: ~220 replacements in 22 files. The mapping is fixed:

| Old colors | New |
|---|---|
| reds `#ef4444` `#dc2626` `#f85149` `#e5484d` `#f87171` `#b91c1c` `#e01a4f` `#ff6b6b`, `rgba(239,68,68)` `(248,113,113)` `(220,38,38)` `(229,72,77)` | `var(--color-tron-red)` |
| greens `#16a34a` `#22c55e` `#4ade80` `#10b981` `#3fb950` `#059669`, `rgba(34,197,94)` `(16,185,129)` `(5,150,105)` `(74,222,128)` `(22,163,74)` | `var(--color-tron-cyan)` |
| blues / indigos `#2563eb` `#3b82f6` `#6366f1` `#60a5fa` `#0891b2`, `rgba(99,102,241)` `(129,140,248)` `(37,99,235)` `(59,130,246)` `(96,165,250)` | `var(--color-tron-cyan)` |
| ambers `#d97706` `#ca8a04` `#eab308` `#f59e0b` `#d29922` `#f9c22e` `#b45309`, `rgba(234,179,8)` `(217,119,6)` `(180,130,0)` `(245,158,11)` | `var(--color-tron-orange)` |

- Colors with an alpha become `color-mix(in srgb, <token> <alpha%>, transparent)`.
- CSS `border-radius` ≤ 16px and TSX `borderRadius` ≤ 16 become 0. Circles (`50%`) and pills
  (> 16px) stay.

Constraints are as in [Lot 1a](2026-10-08-tron-ui-lot1a-frame.md). Visual-first.

## Review Focus

1. **Every Settings section** (General, Models, Skills, Sub-agents, Plugins, MCP, Memory) stays
   usable and readable: states (error / warning / success / disabled) still distinguishable.
2. **SVG presentation attributes** never receive `var(...)` (unreliable in Safari): they use
   `currentColor` + a color class.
3. **Login page** still works at phone width (the composer-like password field).
4. **Escape stacking** (Settings → dialog above it) is unchanged: only styles moved.
5. **Test pins on old colors/radii** are rewritten to the same intent and listed in the commits.

## Tasks

### Task 1: Codemod and shared surfaces
- Run the codemod with `--write` over the 22 files.
- Grep for `(stroke|fill)="var(` and fix each hit to `currentColor` plus a class.
- **Shared surfaces:**
  - `settings.css`: the dialog backdrop at `rgba(0,0,0,0.6)`; the dialog panel gets a
    `var(--color-tron-line)` border and a `var(--shadow-glow-cyan)` shadow
  - `dialog-styles.ts`: the same (`backdropStyle`, `formStyle`)
  - section titles / headings (`.settings-general-title`, `.settings-general-heading`, and the
    section-nav active item) become HUD (`font-family: var(--font-hud)`, uppercase, letter
    spacing, cyan for titles) plus a cyan active trace in the section nav
- **Tests:** create `app/tron-settings.test.mjs`:
  - no off-palette colors in `settings.css` / `globals.css` / `dialog-styles.ts`
  - no `border-radius: [1-9]px` ≤ 16 in `settings.css`
  - the Settings dialog panel and `formStyle` carry the glow
  - the headings use `--font-hud`
- Rewrite the pinned assertions:
  - `McpConfig.test` `.mcp-config-line.is-error` color
  - `SettingsPanel.test` `.web-login-composer` radius
  - `QueueTaskDialog.test` `ERROR_COLOR`
  - any other assertion the full suite reveals
- **Commit:** `feat(ui): Tron settings and dialog surfaces; color and radius sweep`.

### Task 2: Section icons
- `SettingsSectionIcon` (`components/SettingsPanel.tsx`) → lucide:
  - general → `SlidersHorizontal`
  - models → `Cpu`
  - skills → `Layers`
  - agents → `Bot`
  - memory → `Database`
  - mcp → `Server`
  - plugins → `Plug`
- The sidebar child-session robot → lucide `Bot` too. Rewrite the
  `SettingsPanel.test` "robot glyph" assertion to "both use `<Bot`" (same intent: one shared
  glyph).
- Keep `className="settings-section-icon is-agent"` on agents (pinned).
- **Commit:** `feat(ui): lucide settings section icons`.

### Task 3: Gate and review
- Full gate: 0 failures.
- Opus review: one fix pass for Critical / Important. Minors go to the ledger.
- **User visual check:** each Settings section, an agent dialog, project trust, the directory
  picker, login.
