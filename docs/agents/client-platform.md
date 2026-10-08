# Mobile and browser behavior

## Mobile software keyboard (`hooks/useViewportHeight.ts`)
- While an editor has focus and the visual viewport is more than `KEYBOARD_MIN_HEIGHT_PX` (60px) shorter than `innerHeight / scale`, the hook writes `visualViewport.height` to `--app-viewport-height`; smaller shrinks are Safari toolbars. Always compare against that zoom-corrected height, or iOS auto-zoom and pinch zoom leave the composer behind the keyboard.
- WebKit settles the shrunken height only after the keyboard animation, often without another `resize` (bugs.webkit.org 265578), and an IME candidate bar resizes the keyboard with no viewport event at all. So every trigger, composition/input/keyup events on a focused editor included, starts one non-restarting chain of re-reads (`SETTLE_DELAYS_MS`). Reading once per event keeps the full-screen height, and `scrollTo(0, 0)` then fights the page scrolling to the caret: a jittering composer.
- The same check sets `<html data-keyboard-open>`. Under `(max-width: 640px), (pointer: coarse) and (max-height: 500px)` (phone landscape included; tablets keep their controls) CSS hides `.chat-input-controls` and `.extension-status-shelf` and drops the bottom safe-area padding the keyboard covers. `MobilePwaLayout.test.mjs` asserts each targeted class exists on its component, so a rename cannot leave a rule silently dead.

## Keyboard shortcuts (`hooks/useKeyboardShortcuts.ts`, `hooks/useRailShortcuts.ts`)
- Rail agents use `Ctrl+Alt+1..9`, not `Alt+digit`: Firefox on Linux takes `Alt+digit` to switch tabs before the page sees it. `Alt+ArrowUp/Down` (next/previous unread agent) and these keys are handled even from the composer, but not while a dialog is open.
- AltGr (ctrl+alt on Windows/some Linux layouts) is ignored via `getModifierState("AltGraph")`, so AZERTY `#`, `{`, `[`, `|` still type. On macOS, Option+↑/↓ in the composer (paragraph start/end) is taken by the shortcut whenever another unread agent exists (accepted trade-off).
- Visible hints go through `formatShortcut()` / `detectShortcutPlatform()` (`lib/shortcut-label.ts`), read in components with `useShortcutPlatform()` (server snapshot `other`): macOS/iOS/iPadOS get `⌃⌥⇧⌘` glyphs joined without a separator (`⌃⌥N`), elsewhere `Ctrl+Alt+N`. Stop's title ends with `(Esc)`, New session's with the Ctrl+Alt+N chord, the desktop Follow-up button shows a `<kbd>`; phones show none. Each control also sets `aria-keyshortcuts`.
- `?` opens `components/ShortcutsDialog.tsx` (also Settings › General and the mobile toolbar's keyboard button) unless typed into an input, textarea, select or contenteditable, during IME composition, or while a `[role="dialog"]` is open (`isShortcutsHelpKey`). The table is static (`components/shortcuts-table.ts`): the composer rows follow `useEnterSendMode()` and `useIsMobile()` exactly as `ChatInput`'s `sendShortcut` does (Cmd on macOS). A new shortcut needs a row there. The dialog sits at z-index 1100 above Settings and takes Escape through `openStackedDialog`.

## Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Autoplay policy requires unlocking sound from a user gesture: `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

## Reduced motion
- One `@media (prefers-reduced-motion: reduce)` rule in `app/globals.css` stops the shared `blink` / `pulse` / `spin` keyframes: inline `style` users are matched as `[style*="animation"][style*="<name>"]` (browsers reorder the serialised `animation` shorthand), Tailwind as `.animate-spin`, `.animate-pulse` and `[class*="animate-[<name>"]`, plus the rail's `.agent-dot-needs-input`. `!important` is what beats an inline `style`. `app/reduced-motion.test.mjs` fails when a component adds one of these keyframes in a form the rule does not cover. Other animations keep their own `prefers-reduced-motion` blocks (notice shelf, extension widget pulse).

## Push and badges on iOS
- Web Push and app badges need iOS/iPadOS 16.4+ (installed web app). Every push feature (agent notifications, needs-your-answer, failure pushes) degrades silently when push is unsupported or not configured; the rail dot and the `document.title` `(n)` prefix remain the in-page signal.

## Agent drawer tabs (mobile)

On mobile, the agent view's drawer shows a two-tab header (`role="tablist"`, `agents.drawer.home` / `agents.drawer.status`): tab 1 is `AgentSpaceLeft` (home files, triggers), tab 2 is `AgentSpaceRight` (status, usage, memory to approve, tasks). The rail stays on top. The last tab is kept in `localStorage["pi-agent-drawer-tab"]`; it is read in an effect (never during SSR render) through `readDrawerTab()` in `lib/agents/drawer-tab.ts`, and any value other than `status` falls back to `home`. Desktop keeps the left and right panels. Styles: `.agent-drawer-tabs` / `.agent-drawer-tab` / `.is-active` under `@media (max-width: 640px)`.

## Keyboard-open height budget (phones)

With the software keyboard open on a small iPhone, the page keeps a horizontal agent rail with names (~56 px), the find bar when open (~60 px) and the composer. The message area shrinks (about 130 px) but stays usable; close the find bar to regain the space. The pending requests strip (`.agent-pending-strip`) is hidden while the keyboard is open, in a separate rule after the pinned keyboard-open block.
