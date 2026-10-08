# Tron UI — Lot 3: Files and terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user).

**Goal:** finish the Tron identity in the file panel and the terminal:
- explorer and viewer colors
- tab bar with the mockup's cyan active trace
- one Tron syntax-highlighting palette, shared by the viewer and chat code blocks
- a Tron Mermaid theme
- a Tron xterm theme

**Architecture:**
- **Visual-first.** The Lot 2 codemod (`/tmp/tron-sweep.mjs`) is extended with `#d6a84b` and
  `#facc15` → orange, and runs on `FileExplorer`, `FileViewer`, `TabBar` and `globals.css`.
- **Code and diagram palettes.** `lib/tron-syntax-theme.ts` exports `tronSyntaxTheme`, built
  from `vscDarkPlus` with Tron token colors. `FileViewer` and `MermaidBlock` use it, and
  MermaidBlock's `codeBlockDarkTheme` derives from it. Mermaid runs `theme: "base"` with Tron
  `themeVariables`.
- **Terminal.** The xterm theme is rewritten with Tron colors.

**Ruling (agreed in principle by the spec's color-meaning rule):** syntax highlighting and the
8 ANSI terminal colors need several distinct hues, because programs encode meaning in them
(`git diff`, `ls`, compilers). Those palettes keep distinct hues, tuned to the Tron family:
- cyan, orange and red come from the tokens
- green → `#2ef2b0`, blue → `#4f9dff`, magenta → `#ff4dc4`
- dim cyan-greys for black / bright black

The UI chrome stays on the 3-color rule.

**Constraints:** as in [Lot 1a](2026-10-08-tron-ui-lot1a-frame.md).

## Review Focus

1. **Git status colors in the explorer** stay distinguishable: modified orange,
   added/untracked cyan, deleted/conflict red, renamed cyan.
2. **The terminal** keeps readable contrast for every ANSI color on the black background
   (≥ 4.5:1 for the normal colors except `black`).
3. **Syntax highlighting** stays legible: comments dim but ≥ 4.5:1 on the code background.
4. **The HTML preview iframe** keeps its light background (`#eef1f5`), because the content is
   third-party HTML.
5. **The tab bar** keeps keyboard navigation (arrows, Home / End) and middle-click close.

## Tasks

### Task 1: Codemod, tab bar, explorer/viewer colors
- **Test.** Create `components/files-tron.test.mjs`:
  - no off-palette colors in `FileExplorer`, `FileViewer`, `TabBar` or the
    `.terminal-status-dot` rule
  - the TabBar active tab uses
    `shadow-[inset_0_-2px_0_var(--color-tron-cyan)]`
  - no `onMouseEnter` in TabBar
- **Implementation:**
  - run the extended codemod; the live-watch indicator becomes cyan
  - TabBar: active tab gets `bg-bg text-white` plus the trace; inactive tabs get
    `hover:bg-bg-hover hover:text-text`; the close button gets `hover:bg-bg-hover hover:text-text`
    and drops the `hoveredClose` state
- **Commit:** `feat(ui): Tron file panel colors and tab bar`.

### Task 2: Tron syntax and Mermaid palettes
- **Test.** Create `lib/tron-syntax-theme.test.mjs`:
  - comments, strings, keywords and functions use the agreed colors
  - comment contrast is ≥ 4.5:1 on `#000`
  - `FileViewer` and `MermaidBlock` import `tronSyntaxTheme`
  - `mermaid.initialize` uses `theme: "base"` with `primaryBorderColor: "#00d8ff"`
- **Implementation:**
  - the theme maps keyword/operator → `#ff9a00`
  - string/attr-value → `#7fe9ff`
  - function/class-name → `#5ce6ff`
  - number/boolean/constant → `#ffbf66`
  - comment → `#5b8a9a`
  - punctuation → `#7fa6b5`
  - deleted → `#ff4d5e`
  - inserted → `#2ef2b0`
  - default text `#dff6ff`
- **Commit:** `feat(ui): Tron syntax highlighting and Mermaid theme`.

### Task 3: Tron xterm theme
- **Test.** Append to `components/TerminalPanel.test.mjs`:
  - background `#000000`
  - cursor `#00d8ff`
  - red `#ff4d5e`, yellow `#ff9a00`, cyan `#00d8ff`
  - each normal ANSI color except black has ≥ 4.5:1 on `#000`
- **Commit:** `feat(ui): Tron terminal palette`.

### Task 4: Gate, Opus review, fix pass, user visual check

**Visual check:**
- explorer with git changes
- a source file
- markdown with a Mermaid diagram
- the terminal running `git diff --color` and `ls --color`
