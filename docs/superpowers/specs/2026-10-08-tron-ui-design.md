# Tron UI redesign — design

Date: 2026-10-08 · Branch: `feat/tron-ui` (from `local`) · Rollback tag: `pre-tron-ui`
Visual reference: [2026-10-08-tron-ui-mockup.html](2026-10-08-tron-ui-mockup.html) (approved main-screen mockup)

## Goal

Replace the whole Pi Web UI with a single "Tron Legacy" cyberpunk identity and modernize the
components themselves (structure, interactions, motion), not only the palette. The previous
`feat: add cyberpunk theme` commit (`3a4c9c1`) is a palette-only attempt and is superseded.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Upstream divergence | Deep rewrite accepted; upstream syncs will conflict on restyled components. |
| Visual direction | H — Tron Legacy: pure black, thin luminous cyan/orange lines, perspective grid. |
| Other themes | Removed. Tron is the only UI (no light variant). |
| Browser floor | Safari / iOS 16.4+ (was 16.2). `browserslist` and `AGENTS.md` updated. |
| Stack | Tailwind v4 (already installed) + shadcn-style components on Radix + Motion. |
| Scope | Entire UI, delivered in 4 ordered lots. |
| Rollback | Tag `pre-tron-ui` on `local`; all work on `feat/tron-ui`; `local` untouched until approval. |

## Visual language

- **Colors carry meaning.**
  - Cyan `#00d8ff`: system, assistant, selection, focus.
  - Orange `#ff9a00`: the user, running actions, primary action (send).
  - Red: errors only. No other hues.
- **Surfaces.** Background `#000`, panels `#03080b`, hairlines `#0e3a4a`. Text `#dff6ff`, muted `#7fa6b5`.
- **Light.** Glows are box-shadows of 1 px line + ≤14 px blur. They are reserved for focus, the
  active item, running state and the composer. Everything else is flat hairline.
- **Shape.** Square corners. Chamfered corners (`clip-path`) only on the composer and user messages.
  Agent avatars are hexagons.
- **Type.**
  - Orbitron: HUD labels only (small caps, letter-spacing, ≤10 px).
  - Geist: body text.
  - JetBrains Mono: code, tool names, model ids.
  - Fonts are self-hosted via `next/font`; nothing is fetched from Google at runtime.
- **Motion.**
  - Scan bar on running tool calls.
  - Blinking cursor while streaming.
  - Panel/dialog enter/exit with Motion (≤200 ms).
  - Every animation honors `prefers-reduced-motion`.
- **Background.** A perspective grid is shown behind the chat column only, masked to the bottom
  ~40 %. It is decorative, `pointer-events: none`.

## New UI elements

- **Command palette (⌘K / Ctrl+K)**, built with `cmdk`. Commands: new session, new session in a
  worktree, switch model, open each Settings section, jump to session (fuzzy).
- **Compact tool-call rows**: status LED, tool name, argument summary and duration; expand on click.
  The scan bar runs while the call is in progress.
- **Context gauge** in the chat top bar: a conic ring plus a percentage.
- **Floating chamfered composer.** Model, reasoning and tool preset are inline chips; send is an
  orange arrow.
- **Hexagonal agent rail** with status LEDs (orange = running, cyan = done, dim = idle).
- **Toasts** via `sonner`, replacing ad-hoc inline notices where they are transient.

## Architecture

```
app/globals.css        Tron tokens in @theme (colors, glows, chamfers, fonts); legacy palettes removed
components/ui/         shadcn-style primitives styled for Tron:
                       Button, IconButton, Input, Textarea, Dialog, Sheet, DropdownMenu, Popover,
                       Tooltip, Tabs, Switch, ScrollArea, Badge, Led, Kbd, Gauge; lib/cn.ts (clsx + tailwind-merge)
components/tron/       identity pieces: PerspectiveGrid, ScanBar, HexAvatar, StreamCursor
components/*.tsx       business components keep file, props, hooks and logic;
                       only rendering changes (inline style → Tailwind classes, hand-rolled dialogs → Radix)
app/dev/ui/page.tsx    dev-only primitives gallery (404 in production)
```

**Rules**
- **Visual-first (decided 2026-10-08, after Lot 0).** Rewrite everything that is visible: structure,
  surfaces, buttons, icons, typography, states. Use the Tron primitives and Tailwind classes for it.
  Inline styles that only do invisible layout (`display`/`flex`, `overflow`, `minWidth: 0`,
  safe-area insets, keyboard-height math) stay until their zone is touched for a visible reason.
  Why: the same rendered result for 3–5x fewer tokens, fewer broken source-regex tests, and less
  risk on the iOS keyboard and safe-area paths.
- No logic, hook, API route or data-flow change. A behavior bug found during the restyle gets its
  own `fix:` commit.
- Hand-rolled dialogs, popovers and menus move to Radix. Their existing a11y behavior (Escape
  stacking, focus return, 44 px touch targets) must be preserved. `lib/stacked-dialog.ts`
  semantics stay as they are.
- `components/ChatMinimap.module.css` and `app/settings.css` are folded into Tailwind classes in
  the lot that owns them, then deleted.
- No new dependency beyond: `radix-ui`, `motion`, `cmdk`, `sonner`, `lucide-react`, `clsx`,
  `tailwind-merge`, `class-variance-authority`, `geist`. Anything else needs approval.

**Removed theme plumbing**
- `lib/theme.ts` and `hooks/useTheme.ts` are removed; the theme selector disappears from Settings.
- The `settings.theme*` i18n keys are removed.
- `e2e/themes.mjs` is removed or replaced by a Tron smoke check.
- `THEME_INIT_SCRIPT` goes away. The root always carries the dark color-scheme.
- Mermaid, syntax highlighting and xterm get a fixed Tron palette.

## Lots

Each lot lands as one or more commits on `feat/tron-ui` and is validated before the next starts.

**Lot 0 — Foundations**
- Revert `3a4c9c1`.
- `browserslist` → Safari / iOS 16.4.
- Update the "Old Safari" section of `AGENTS.md`.
- Install the dependencies.
- Add the Tron tokens, fonts, `components/ui/*`, `components/tron/*` and `/dev/ui`.
- Remove the theme plumbing.

**Lot 1 — Shell + chat**
- `AppShell`, `SessionSidebar`, `agents/AgentRail`, `ChatWindow`, `MessageView`, `CodemodeToolView`,
  `ChatInput`, `BranchNavigator`, `ChatMinimap`, `MarkdownBody`.
- Add the command palette and toasts.

**Lot 2 — Settings + dialogs**
- `SettingsPanel`, `SettingsUi`, `ModelsConfig`, `EnabledModelsSection`, `McpConfig`,
  `McpAddServer`, `McpSignIn`, `OAuthPastePanel`, `SkillsConfig`, `PluginsConfig`, `AgentsConfig`.
- `ProjectTrustDialog`, `ShortcutsDialog`, `DirectoryPicker`, `ImagePreview`.
- `agents/*` dialogs and panels.
- The web login page.

**Lot 3 — Files + terminal**
- `FileExplorer`, `FileViewer`, `TabBar`, the terminal panel (xterm theme), Mermaid and code-block
  palettes.

## Testing

- **Source-regex tests.** The 86 `components/**/*.test.mjs` files are mostly regex assertions on
  component source.
  - Assertions that only pin an inline style are deleted.
  - Assertions about behavior (`data-*` attributes, handlers, render conditions, a11y attributes)
    are rewritten against the new markup, keeping their intent.
  - Every deleted assertion is listed in the commit message body.
- **Per-lot gate** (all must pass):
  - `node_modules/.bin/tsc --noEmit`
  - `npm run lint`
  - `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test`
  - the relevant `e2e/*.mjs` (Chromium download for Playwright needs approval first)
  - a visual check by the user on the dev server (port 30141)
- **Lot 0 adds two checks:**
  - a test that `browserslist` targets Safari ≥ 16.4;
  - a test that `/dev/ui` is not served in production builds (route guard).

## Rollback

- `pre-tron-ui` is an annotated tag on `local` at `3a4c9c1`, created before any change.
- **Before merge:** do nothing. `local` is untouched; delete `feat/tron-ui` to abandon.
- **After a merge into `local`:** `git revert -m 1 <merge-sha>`.
- **Nothing pushed since the merge:** `git reset --hard pre-tron-ui` on `local`.
- Each lot is a separate merge, so a single lot can be reverted on its own.

## Impact

- **Bundle:** about +60–90 KB gzip on the client (Motion, Radix, cmdk). Fonts add ~100 KB, cached.
- **Upstream sync:** restyled components will conflict. Strategy, to be recorded in the fork's
  `AGENT.md`: keep our JSX and port upstream logic changes by hand.
- **Accessibility:** Radix improves focus management. The contrast of cyan/muted text on black is
  ≥ 4.5:1 for body text; `#4f8fa3` dim is used only for non-essential labels.

## Out of scope

- Behavior or feature changes beyond the listed new UI elements.
- A light theme.
- Upstreaming any of this to `agegr/pi-web`.
