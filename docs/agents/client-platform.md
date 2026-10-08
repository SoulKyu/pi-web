# Mobile and browser behavior

## Mobile software keyboard (`hooks/useViewportHeight.ts`)
- While an editor has focus and the visual viewport is more than `KEYBOARD_MIN_HEIGHT_PX` (60px) shorter than `innerHeight / scale`, the hook writes `visualViewport.height` to `--app-viewport-height`; smaller shrinks are Safari toolbars. Always compare against that zoom-corrected height, or iOS auto-zoom and pinch zoom leave the composer behind the keyboard.
- WebKit settles the shrunken height only after the keyboard animation, often without another `resize` (bugs.webkit.org 265578), and an IME candidate bar resizes the keyboard with no viewport event at all. So every trigger, composition/input/keyup events on a focused editor included, starts one non-restarting chain of re-reads (`SETTLE_DELAYS_MS`). Reading once per event keeps the full-screen height, and `scrollTo(0, 0)` then fights the page scrolling to the caret: a jittering composer.
- The same check sets `<html data-keyboard-open>`. Under `(max-width: 640px), (pointer: coarse) and (max-height: 500px)` (phone landscape included; tablets keep their controls) CSS hides `.chat-input-controls` and `.extension-status-shelf` and drops the bottom safe-area padding the keyboard covers. `MobilePwaLayout.test.mjs` asserts each targeted class exists on its component, so a rename cannot leave a rule silently dead.

## Keyboard shortcuts (`hooks/useKeyboardShortcuts.ts`, `hooks/useRailShortcuts.ts`)
- Rail agents use `Ctrl+Alt+1..9`, not `Alt+digit`: Firefox on Linux takes `Alt+digit` to switch tabs before the page sees it. `Alt+ArrowUp/Down` (next/previous unread agent) and these keys are handled even from the composer, but not while a dialog is open.

## Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Autoplay policy requires unlocking sound from a user gesture: `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

## Push and badges on iOS
- Web Push and app badges need iOS/iPadOS 16.4+ (installed web app). Every push feature (agent notifications, needs-your-answer, failure pushes) degrades silently when push is unsupported or not configured; the rail dot and the `document.title` `(n)` prefix remain the in-page signal.

## Agent drawer tabs (mobile)

On mobile, the agent view's drawer shows a two-tab header (`role="tablist"`, `agents.drawer.home` / `agents.drawer.status`): tab 1 is `AgentSpaceLeft` (home files, triggers), tab 2 is `AgentSpaceRight` (status, usage, memory to approve, tasks). The rail stays on top. The last tab is kept in `localStorage["pi-agent-drawer-tab"]`; it is read in an effect (never during SSR render) through `readDrawerTab()` in `lib/agents/drawer-tab.ts`, and any value other than `status` falls back to `home`. Desktop keeps the left and right panels. Styles: `.agent-drawer-tabs` / `.agent-drawer-tab` / `.is-active` under `@media (max-width: 640px)`.
