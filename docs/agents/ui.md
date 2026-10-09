# UI: the Tron design system

Fork-only (not upstream). Spec: `docs/superpowers/specs/2026-10-08-tron-ui-design.md`.

- **One palette.** `app/globals.css` `:root` maps the legacy variables (`--bg`, `--accent`, …) to Tron values; `@theme static` adds `tron-*` colors, `shadow-glow-*`, `font-hud/sans/mono`, `animate-tron-*`. It is `static` because plain CSS reads those variables too and Tailwind otherwise emits only the ones class names use. There is no theme switch, `<html>` always has `class="dark"`.
- **Color = meaning.** Cyan: system / assistant / selection / focus. Orange: the user, running work, the primary action. Red: errors. Do not add hues.
- **Glow sparingly.** `shadow-glow-*` on focus, the active item, running state and the composer only.
- **Primitives live in `components/ui/`** (shadcn-style, Radix underneath, owned by us). Overlays always take a translated `closeLabel`. Every `animate-tron-*` pairs with `motion-reduce:animate-none` (pinned by `components/ui/radix.test.mjs`).
- **Chamfers and hexes:** `clip-path` clips `box-shadow`. Use `Chamfer` (`components/tron`): its border is a clipped outer layer and its glow a `drop-shadow` on a wrapper. A `filter` makes the wrapper the containing block for `position: fixed` children, so overlays inside must portal (Radix does).
- **Touch:** interactive primitives reach 44 px under `pointer-coarse:`. The 20 px `Switch` must sit in a ≥44 px label row.
- **`/dev/ui`** is the primitives gallery: 404 in production, behind the web password through the `proxy.ts` matcher (`/dev/:path*`).
- **Agent conversation view** (`app/agent-conversation.css`): prose fills the chat column (no measure cap: a 72ch cap was rejected in use), body +1 px over the chat font setting (15 px by default), line-height 1.6, a 40 px avatar gutter, no `font-hud` in the thread or the list. Rules are scoped under `[data-chat-style="agent"]`.
