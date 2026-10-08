# Tron UI — Lot 1a: Frame (top bar, agent rail, session sidebar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the frame around the chat to the approved mockup: a Tron top bar with session
title, running badge and context gauge; a hexagonal agent rail with Tron LEDs and real icons; and a
session sidebar with a HUD title, an orange active-session trace, LED indicators and Tron
confirm/rename states.

**Architecture:**
- Visual-first (spec rule): only what is visible changes. Each JS hover handler is replaced by
  CSS `hover:` classes, hard-coded colors move to Tron tokens, and emoji or hand-drawn SVG icons
  become `lucide-react` icons.
- Pure layout inline styles (flex, overflow, safe-area, sizing constants) stay.
- New shared pieces get their own file and a render test. Call sites keep every `data-*`, `aria-*`,
  `title` and handler.

**Tech Stack:** Lot 0 primitives (`components/ui/*`, `components/tron/*`, `lib/cn.ts`), Tailwind v4
tokens (`tron-*`, `shadow-glow-*`, `font-hud`), `lucide-react` 1.53.0.

**Spec:** [docs/superpowers/specs/2026-10-08-tron-ui-design.md](../specs/2026-10-08-tron-ui-design.md)
(read the "Visual-first" rule). Mockup: [2026-10-08-tron-ui-mockup.html](../specs/2026-10-08-tron-ui-mockup.html).

**Plan shape (deviation from writing-plans, agreed approach):** this lot restyles ~5 500 existing
lines. New components get complete code. Call sites get precise transformation rules with anchors
(function names, current snippets) instead of full before/after listings. The executor reads each
anchored block before editing it.

## Global Constraints

- Branch `feat/tron-ui`, worktree `/home/ubuntu/Workspace/soulkyu/pi-web`. Never touch `local`.
  Rollback tag `pre-tron-ui`.
- **Color meaning:**
  - cyan `tron-cyan`: system / selection / focus / unread
  - orange `tron-orange`: the user's current session, running work, attention needed
  - red `tron-red`: errors, destructive actions, failed state
  - no other hues: every `#ef4444`, `#dc2626`, `#d97706`, `#0891b2`, `#30a46c`, `#d29922`,
    `#f85149`, `#e5484d`, `#3fb950`, `rgba(234,179,8,…)`, `rgba(37,99,235,…)` in the touched files
    becomes a token
  - warnings (formerly amber `#d97706`) use orange
- **Glow** only on focus, the active item, running state.
- **Fonts:** Orbitron (`font-hud`, uppercase, tracking, ≤10 px) for HUD labels only; mono for
  numbers / model ids.
- **Keep untouched:** every `data-*`, `aria-*`, `title`, `role`, `tabIndex`, handler and
  conditional-render expression. The tests pin them.
- **Touch targets:** no interactive element shrinks below its current size. Coarse-pointer 44 px
  rules in `globals.css` stay.
- **Reduced motion:** any new animation pairs with `motion-reduce:animate-none`, or with the CSS
  guard already in `globals.css`.
- **Tests:**
  - single file: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test <file>`
  - full suite: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test`
- **Typecheck:** `node_modules/.bin/tsc --noEmit`. **Lint:** `npm run lint`. **Never** `next build`.
- **Staging `AGENTS.md`:** never stage the `nextjs-agent-rules` block (recipe in the Lot 0 plan).
  This lot does not touch `AGENTS.md`.
- **Deleted or rewritten test assertions** are listed in the commit body.
- **Final review:** fresh subagent on `claude-bridge/claude-opus-5-5:high`.

## Review Focus

1. **Narrow mobile (≤480 px).** The "more" layer still covers the toolbar, and the stats button
   hides when covered. Pinned by the existing `AppShell.mobile-toolbar.test.mjs` assertions;
   re-run in Task 1.
2. **Context usage `null`, or a `contextWindow` with `percent: null`.** The top bar shows `?`, no
   gauge, and no crash. Pinned in Task 1, Step 1.
3. **An agent avatar whose emoji is a ZWJ sequence** (👩‍💻) stays whole in the hex. Initials no
   longer split grapheme clusters (deferred Lot 0 minor). Pinned in Task 2, Step 1.
4. **A session row in delete-confirm or rename state** keeps its fixed 54 px height; the list does
   not reflow. Pinned in Task 3, Step 1 (`SESSION_LIST_ITEM_HEIGHT` stays the row height).
5. **The selected session while it runs.** The orange trace and the running LED are both visible.
   The LED carries the accessible running label (it was on the spinner). Pinned in Task 3, Step 1.

---

### Task 1: Top bar: `TopBarButton`, session title, running badge, context gauge

**Files:**
- Create: `components/shell/TopBarButton.tsx`, `components/shell/top-bar.test.mjs`
- Modify: `components/AppShell.tsx`. Anchors: `renderProjectTrustWarning`, `renderChatToolbarActions`,
  `renderSessionStatsButton`, `renderMainFileToggle`, the sidebar toggle button under
  `{/* Top bar with sidebar toggle */}`, the narrow-mobile "more" button, the `<style>` block's
  `session-info-pop` keyframes, the `{activeTopPanel && topPanelPos && (` dropdown container, the
  mobile backdrop `rgba(0,0,0,0.4)`, and `workspace.unable` `#dc2626`.

**Interfaces:**
- Consumes: `cn`, `Gauge`, `Led`, `Badge` (Lot 0).
- Produces:
  - `TopBarButton` (`components/shell/TopBarButton.tsx`): props `ComponentProps<"button"> & {
    active?: boolean; tone?: "default" | "danger" | "success" | "warning"; iconOnly?: boolean;
    edge?: "right" | "left" | "none" }`. It renders a `<button type="button">` that fills the bar
    height, with CSS hover/active states.
  - `contextTone(percent: number | null): "cyan" | "orange" | "red"`, exported from the same file
    for the stats text color (≥90 red, ≥75 orange, else cyan; `null` → cyan).

- [ ] **Step 1: Write the failing tests**

`components/shell/top-bar.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TopBarButton, contextTone } = await jiti.import("./TopBarButton.tsx");
const shell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");
const h = React.createElement;

test("TopBarButton is a typed button with CSS hover and an active trace", () => {
  const idle = renderToStaticMarkup(h(TopBarButton, { "aria-label": "History" }, "x"));
  assert.match(idle, /^<button[^>]*type="button"/);
  assert.match(idle, /hover:text-text/);
  assert.doesNotMatch(idle, /shadow-\[inset_0_-2px/);
  const active = renderToStaticMarkup(h(TopBarButton, { active: true, "aria-label": "Stats" }, "x"));
  assert.match(active, /shadow-\[inset_0_-2px_0_var\(--color-tron-cyan\)\]/);
  assert.match(renderToStaticMarkup(h(TopBarButton, { tone: "danger" }, "x")), /text-tron-red/);
});

test("contextTone: cyan, orange from 75, red from 90, cyan when unknown", () => {
  assert.equal(contextTone(null), "cyan");
  assert.equal(contextTone(74.9), "cyan");
  assert.equal(contextTone(75), "orange");
  assert.equal(contextTone(90), "red");
});

test("the top bar has no JS hover handlers and no off-palette colors", () => {
  const start = shell.indexOf("const renderProjectTrustWarning");
  const end = shell.indexOf("return (\n    <>\n    <style>");
  const toolbar = shell.slice(start, end);
  assert.doesNotMatch(toolbar, /onMouseEnter|onMouseLeave/);
  assert.doesNotMatch(shell, /#ef4444|#dc2626|#d97706|rgba\(234,179,8|rgba\(37,99,235/);
});

test("the desktop top bar shows the session title, a running badge and a context gauge", () => {
  assert.match(shell, /data-top-bar-title="true"/);
  assert.match(shell, /<Badge tone="orange"[^>]*>\s*<Led status="running"/);
  assert.match(shell, /<Gauge value=\{contextUsage\.percent\}/);
  // percent null keeps the "?" text and renders no gauge
  assert.match(shell, /contextUsage\?\.contextWindow && contextUsage\.percent !== null && \(\s*<Gauge/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/shell/top-bar.test.mjs`
Expected: FAIL (`Cannot find module './TopBarButton.tsx'`).

- [ ] **Step 3: Implement `TopBarButton`**

`components/shell/TopBarButton.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const TONES = {
  default: "text-text-muted hover:text-text",
  danger: "text-tron-red hover:text-tron-red",
  success: "text-tron-cyan hover:text-tron-cyan",
  warning: "text-tron-orange hover:text-tron-orange",
} as const;

const EDGES = { right: "border-r border-tron-line", left: "border-l border-tron-line", none: "" } as const;

type TopBarButtonProps = ComponentProps<"button"> & {
  active?: boolean;
  tone?: keyof typeof TONES;
  iconOnly?: boolean;
  edge?: keyof typeof EDGES;
};

export function TopBarButton({ active = false, tone = "default", iconOnly = false, edge = "right", className, type, ...props }: TopBarButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "flex h-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap bg-transparent text-[11px] outline-none transition-[color,background-color,box-shadow] duration-100 hover:bg-bg-hover focus-visible:shadow-glow-cyan disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent [&_svg]:size-3.5 [&_svg]:shrink-0",
        iconOnly ? "aspect-square p-0" : "px-3",
        TONES[tone],
        EDGES[edge],
        active && "bg-bg-selected text-white shadow-[inset_0_-2px_0_var(--color-tron-cyan)]",
        className,
      )}
      {...props}
    />
  );
}

export function contextTone(percent: number | null): "cyan" | "orange" | "red" {
  if (percent === null) return "cyan";
  if (percent >= 90) return "red";
  if (percent >= 75) return "orange";
  return "cyan";
}
```

- [ ] **Step 4: Convert the top-bar buttons in `AppShell.tsx`**

Apply these rules to every `<button>` inside `renderProjectTrustWarning`, `renderChatToolbarActions`,
`renderSessionStatsButton`, `renderMainFileToggle`, the sidebar toggle and the narrow-mobile more
button:
1. **Element.** `<button …>` becomes `<TopBarButton …>`. Keep `onClick`, `disabled`, `tabIndex`,
   `title`, every `aria-*`, every `data-*`, `className` and `ref`.
2. **Delete** `onMouseEnter` and `onMouseLeave`.
3. **Delete from `style`** every visual key: `background`, `border*`, `color`, `cursor`, `opacity`,
   `transition`, `fontSize`, `padding` and the hover colors.
   **Keep** `width`/`height` (`TOP_BAR_ICON_BUTTON_SIZE`), `marginLeft`, `flex`, `minWidth`,
   `gap`, `overflow`, `visibility`, `pointerEvents`, `fontVariantNumeric`.
   If `style` becomes empty, remove it.
4. **Map states to props:**
   - `aria-pressed={activeTopPanel === "session"}` or `rightPanelOpen` → `active={…same expression}`
   - `isError` → `tone="danger"`
   - `isSuccess` → `tone="success"`
   - the project-trust warning → `tone="warning"`
   - icon-only buttons (fixed `TOP_BAR_ICON_BUTTON_SIZE` width) → `iconOnly`
   - `borderLeft` → `edge="left"`
   - no border → `edge="none"`
5. **Icons.** Replace each hand-drawn SVG with the `lucide-react` equivalent, adding
   `aria-hidden`:
   - sidebar open/closed → `PanelLeftClose` / `PanelLeftOpen`
   - more / close → `Ellipsis` / `X`
   - history → `History`
   - auto-name → `Sparkles`
   - file panel → `PanelRight`
   - tokens in / out / cache → `ArrowUp` / `ArrowDown` / `RotateCw`
   - context → `Gauge` from lucide is **not** used: the Lot 0 `Gauge` primitive replaces the icon
     (rule 6)

   Import lucide's `Gauge` only if needed, and alias it to avoid the name clash.
6. **Stats button contents.** In `renderSessionStatsButton`:
   - remove the `contextColor` variable
   - render the numbers in `font-mono tabular-nums`
   - render the context part as
     ```tsx
     {desktopContextText && (
       <span className={cn("flex items-center gap-1.5", { cyan: "text-text-muted", orange: "text-tron-orange", red: "text-tron-red" }[contextTone(contextUsage?.percent ?? null)])}>
         {contextUsage?.contextWindow && contextUsage.percent !== null && (
           <Gauge value={contextUsage.percent} label={translate("session.title")} size={16} />
         )}
         {desktopContextText}
       </span>
     )}
     ```
   - on mobile, `mobileContextText` uses the same tone class without the gauge (space)
   - the cost span gets `text-text`
7. **Title and running badge, desktop only.** Insert immediately before
   `{renderProjectTrustWarning(false)}` inside `{!isMobile && (<>…</>)}`:
   ```tsx
   {selectedSession && (
     <span data-top-bar-title="true" className="flex min-w-0 items-center gap-2 px-3">
       <span className="truncate text-[13px] font-semibold text-text">{selectedSession.name || selectedSession.firstMessage.slice(0, 60) || selectedSession.id.slice(0, 12)}</span>
       {runningSessionIds.has(selectedSession.id) && (
         <Badge tone="orange" className="shrink-0">
           <Led status="running" />{translate("sidebar.agentRunning")}
         </Badge>
       )}
     </span>
   )}
   ```
   If `selectedSession.firstMessage` is optional in its type, use `?.slice` and keep the fallback
   chain. The stats button keeps `marginLeft: "auto"` on desktop, so the title sits left and the
   stats right.
8. **Top bar container.** `background: "var(--bg-panel)"` stays. Add `className="font-sans"` to the
   `topBarRef` div.
9. **Off-palette colors in the rest of `AppShell.tsx`:**
   - `session-info-pop` keyframes: replace `rgba(37,99,235,0.16)` with `rgb(0 216 255 / 0.18)`;
     the other `rgba(0,0,0,…)` shadows stay
   - mobile backdrop: `rgba(0,0,0,0.4)` → `rgba(0,0,0,0.6)`
   - `#dc2626` (workspace unable) → `var(--color-tron-red)`
   - `#d97706` (trust warning) → `var(--color-tron-orange)`
   - the top-panel dropdown container: add `border: "1px solid var(--color-tron-line)"`,
     `boxShadow: "var(--shadow-glow-cyan)"`, and set `borderRadius: 0` if a radius is present

- [ ] **Step 5: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/shell/top-bar.test.mjs components/AppShell.mobile-toolbar.test.mjs components/AppShell.auto-name.test.mjs components/AppShell.open-agent.test.mjs components/AppShell.file-viewer-state.test.mjs`
Expected: PASS. If a pre-existing AppShell assertion pins a removed visual style key (not a
`data-*`, `aria-*` or behavior), rewrite it to pin the new class or prop that carries the same
intent, and list it in the commit body.

- [ ] **Step 6: Typecheck, lint, visual check, commit**

Run: `node_modules/.bin/tsc --noEmit && npm run lint`
Visual: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:30141/` → `200`.
```bash
git add components/shell components/AppShell.tsx components/*.test.mjs
git commit -m "feat(ui): Tron top bar: TopBarButton, session title, running badge, context gauge"
```

---

### Task 2: Agent rail: hex avatars, Tron LEDs, lucide icons, health popover

**Files:**
- Modify: `components/tron/index.tsx` (`HexAvatar`: `color`, `size`, `children`, grapheme-safe
  initials), `components/tron/tron.test.mjs`
- Modify: `components/agents/AgentAvatar.tsx`, `components/agents/AgentRail.tsx`
- Modify: `app/globals.css` (rules `.agent-rail*`, `.agent-badge`, `.agent-running-dot`,
  `.agent-dot-*`, `@keyframes agent-dot-pulse`)
- Test: `components/agents/AgentRail.test.mjs` (horizontal-style assertion), new
  `components/agents/agent-avatar.test.mjs`

**Interfaces:**
- Consumes: `cn`, `Led`, `HexAvatar`.
- Produces: `HexAvatar({ label: string; active?: boolean; color?: string; size?: number;
  className?: string; children?: ReactNode })`. `children` replaces the initials; `color` is the
  inactive border color (default `var(--color-tron-line)`); `size` is in px (default 28).

- [ ] **Step 1: Write the failing tests**

Append to `components/tron/tron.test.mjs`:
```js
test("HexAvatar keeps ZWJ emoji whole and accepts color, size and custom content", () => {
  assert.match(html(h(HexAvatar, { label: "👩‍💻dev" })), />👩‍💻D</);
  const custom = html(h(HexAvatar, { label: "ops", color: "#ff00aa", size: 32 }, "🤖"));
  assert.match(custom, />🤖</);
  assert.match(custom, /background:#ff00aa/);
  assert.match(custom, /width:32px/);
});
```

Create `components/agents/agent-avatar.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AgentAvatar } = await jiti.import("./AgentAvatar.tsx");
const rail = await readFile(new URL("./AgentRail.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const h = React.createElement;
const avatar = { emoji: "🤖", color: "#7c3aed" };

test("AgentAvatar is a hex in the agent's color, cyan when selected, emoji intact", () => {
  const idle = renderToStaticMarkup(h(AgentAvatar, { avatar }));
  assert.match(idle, /tron-hex/);
  assert.match(idle, /background:#7c3aed/);
  assert.match(idle, />🤖</);
  const selected = renderToStaticMarkup(h(AgentAvatar, { avatar, selected: true }));
  assert.match(selected, /bg-tron-cyan|var\(--color-tron-cyan\)/);
});

test("rail dots and badge use Tron colors: running orange, needs-input orange pulse, failed red, unread cyan", () => {
  const rule = (sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf("}", css.indexOf(`${sel} {`)));
  assert.match(rule(".agent-running-dot"), /var\(--color-tron-orange\)/);
  assert.match(rule(".agent-dot-needs-input"), /var\(--color-tron-orange\)/);
  assert.match(rule(".agent-dot-failed"), /var\(--color-tron-red\)/);
  assert.match(rule(".agent-badge"), /var\(--color-tron-cyan\)/);
  assert.doesNotMatch(css, /#30a46c|#d29922|#f85149|#e5484d/);
});

test("rail buttons use lucide icons, not emoji glyphs, and health levels map to Tron colors", () => {
  for (const glyph of ["📥", "⧉", "☰", "⏸", "▶", "🌙", "⚠"]) assert.ok(!rail.includes(glyph), glyph);
  assert.match(rail, /from "lucide-react"/);
  assert.match(rail, /ok: "var\(--color-tron-cyan\)", warn: "var\(--color-tron-orange\)", down: "var\(--color-tron-red\)"/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/tron/tron.test.mjs components/agents/agent-avatar.test.mjs`
Expected: FAIL (ZWJ initials split; AgentAvatar is round; emoji glyphs present).

- [ ] **Step 3: Extend `HexAvatar`**

In `components/tron/index.tsx` replace `initials` and `HexAvatar` with:
```tsx
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function initials(label: string): string {
  const trimmed = label.trim();
  const graphemes = segmenter ? Array.from(segmenter.segment(trimmed), (part) => part.segment) : Array.from(trimmed);
  const letters = graphemes.slice(0, 2).join("");
  return letters ? letters.toUpperCase() : "?";
}

type HexAvatarProps = { label: string; active?: boolean; color?: string; size?: number; className?: string; children?: ReactNode };

export function HexAvatar({ label, active = false, color, size = 28, className, children }: HexAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn("tron-hex grid shrink-0 place-items-center p-px", active && "bg-tron-cyan", className)}
      style={{ width: size, height: size, ...(active ? {} : { background: color ?? "var(--color-tron-line)" }) }}
    >
      <span className={cn("tron-hex grid size-full place-items-center font-hud text-[9px]", active ? "bg-[#00303a] text-white" : "bg-black text-tron-cyan")}>
        {children ?? initials(label)}
      </span>
    </span>
  );
}
```
Remove the old `size-7` class: size now comes from `style`. The existing HexAvatar tests still pass.

- [ ] **Step 4: Rebuild `AgentAvatar` on `HexAvatar`**

`components/agents/AgentAvatar.tsx` body:
```tsx
export function AgentAvatar({ avatar, size = 28, running = false, state, unread = 0, selected = false, title }: { avatar: Avatar; size?: number; running?: boolean; state?: AgentState; unread?: number; selected?: boolean; title?: string }) {
  const badge = unreadLabel(unread);
  return (
    <span title={title} aria-hidden className={cn("relative inline-flex shrink-0", selected && "drop-shadow-[0_0_6px_rgb(0_216_255/0.6)]")} style={{ width: size, height: size }}>
      <HexAvatar label={title ?? ""} active={selected} color={avatar.color} size={size}>
        <span style={{ fontSize: Math.round(size * 0.46) }}>{avatar.emoji}</span>
      </HexAvatar>
      {badge && <span className="agent-badge">{badge}</span>}
      {state === "needs_input" ? <span className="agent-running-dot agent-dot-needs-input" /> : state === "failed" ? <span className="agent-running-dot agent-dot-failed" /> : running && <span className="agent-running-dot" />}
    </span>
  );
}
```
Imports: `cn` from `@/lib/cn`, `HexAvatar` from `@/components/tron`.

- [ ] **Step 5: Rail CSS**

In `app/globals.css` replace the five rules with:
```css
.agent-badge { position: absolute; top: -4px; right: -6px; background: var(--color-tron-cyan); color: #000; font-size: 9px; line-height: 14px; padding: 0 4px; font-weight: 700; font-family: var(--font-mono); }
.agent-running-dot { position: absolute; bottom: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: var(--color-tron-orange); box-shadow: 0 0 6px var(--color-tron-orange); border: 2px solid var(--bg-panel); }
.agent-dot-needs-input { background: var(--color-tron-orange); animation: agent-dot-pulse 1.2s ease-in-out infinite; }
.agent-dot-failed { background: var(--color-tron-red); box-shadow: 0 0 6px var(--color-tron-red); }
@keyframes agent-dot-pulse { 50% { opacity: 0.35; } }
```
In the `.agent-rail` and `.agent-rail-horizontal` rules, change `gap: 8px` to `gap: 10px` and
`border-right` / `border-bottom` to `1px solid var(--color-tron-line)`.
Check the `@media` copy of `.agent-rail` (~line 1965) and apply the same border token.

- [ ] **Step 6: Rail buttons and icons**

In `components/agents/AgentRail.tsx`:
- **Shared classes.** Replace `railButtonStyle` with a class constant:
  ```ts
  const railButtonClass = "flex size-8 shrink-0 items-center justify-center bg-transparent p-0 text-text-muted outline-none transition-colors hover:text-tron-cyan focus-visible:shadow-glow-cyan [&_svg]:size-4";
  ```
  Each `style={railButtonStyle}` becomes `className={railButtonClass}`. Each
  `style={{ ...railButtonStyle, X }}` becomes `className={cn(railButtonClass, <classes for X>)}`,
  keeping layout-only keys (`marginTop: "auto"`, `marginLeft: "auto"`) as classes `mt-auto` /
  `ml-auto`.
- **Color states.**
  - `color: var(--accent)` for active states (paused, sessions pressed) → `text-tron-cyan`
  - the confirm-yes button → `border border-tron-cyan text-tron-cyan`
  - cancel → `border border-tron-line`
  - drop the radii
- **Agent buttons.**
  - vertical: `className={cn(railButtonClass, "size-9")}`
  - horizontal: `className={cn(railButtonClass, "h-auto w-auto flex-col gap-0.5 px-0.5")}`
  - no inline min sizes, so the coarse-pointer rule still wins
- **Glyphs → lucide** (`aria-hidden`):
  - `+` → `Plus`
  - health `⚠` → `TriangleAlert`
  - `🌙` → `Moon` (keep `role="img"` + `aria-label` on the wrapper span)
  - `▶` / `⏸` → `Play` / `Pause`
  - `✓` / `✕` → `Check` / `X`
  - stale `⚠` → `TriangleAlert`
  - `📥` → `Inbox`
  - `⧉` → `ListTodo`
  - `☰` → `Menu`
- **Health colors.** `HEALTH_COLORS` becomes
  `{ ok: "var(--color-tron-cyan)", warn: "var(--color-tron-orange)", down: "var(--color-tron-red)" }`.
  The dot gets `boxShadow: \`0 0 6px ${HEALTH_COLORS[level]}\``.
- **Health popover.** Container style: `border: "1px solid var(--color-tron-line)"`,
  `borderRadius: 0`, `background: "#000"`, `boxShadow: "var(--shadow-glow-cyan)"`. The first
  line gets `font-hud text-[10px] uppercase tracking-[0.14em] text-tron-cyan` instead of
  `fontWeight: 600`.

- [ ] **Step 7: Update the pinned horizontal-style assertion**

In `components/agents/AgentRail.test.mjs` test `"the horizontal rail shows each agent's name under
its avatar…"`, replace the `horizontalStyle` extraction and its two assertions with:
```js
  const horizontalClass = rail.match(/vertical \? cn\(railButtonClass, "size-9"\) : cn\(railButtonClass, ("[^"]*")\)/)?.[1] ?? "";
  assert.match(horizontalClass, /flex-col/);
  // Inline min sizes would beat the coarse-pointer 44px rule in globals.css.
  assert.doesNotMatch(horizontalClass, /min-w|min-h/);
```
The agent button `className` must therefore be written exactly as
`className={vertical ? cn(railButtonClass, "size-9") : cn(railButtonClass, "h-auto w-auto flex-col gap-0.5 px-0.5")}`.

- [ ] **Step 8: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/tron/tron.test.mjs components/agents/agent-avatar.test.mjs components/agents/AgentRail.test.mjs`
Expected: PASS.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/tron components/agents app/globals.css
git commit -m "feat(ui): hexagonal agent rail with Tron LEDs and lucide icons" -m "Rewritten assertion: AgentRail horizontal button style → horizontal button classes (same intent: column layout, no inline min sizes)."
```

---

### Task 3: Session sidebar: HUD title, toolbar buttons, Tron rows and indicators

**Files:**
- Modify: `components/SessionSidebar.tsx`. Anchors: `ToolbarIconButton`, `PiWebTitle`,
  `RunningSessionIndicator`, `UnreadSessionIndicator`, `showProjectActivity`,
  `sessionStripButtonStyle`, `sessionMoreButtonStyle`, `SessionItem` (row style, delete confirm,
  rename input, subagent icon), and the search input (`className="mt-[6px] block h-[29px] …"`).
- Test: new `components/session-sidebar-tron.test.mjs`; existing `components/SessionSidebar*.test.mjs`.

**Interfaces:**
- Consumes: `cn`, `Led`, `fieldClass` (from `components/ui/input`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

`components/session-sidebar-tron.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const fn = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\nfunction ", start + 10) === -1 ? undefined : source.indexOf("\nfunction ", start + 10));
};

test("no off-palette colors or JS hover handlers remain in the sidebar", () => {
  assert.doesNotMatch(source, /#ef4444|#dc2626|#0891b2|#d97706|rgba\(239,\s*68,\s*68/);
  assert.doesNotMatch(fn("ToolbarIconButton"), /onMouseEnter|onMouseLeave/);
});

test("the title is a HUD label", () => {
  assert.match(fn("PiWebTitle"), /font-hud/);
});

test("running and unread indicators are labelled LEDs (orange running, cyan unread)", () => {
  assert.match(fn("RunningSessionIndicator"), /<Led status="running" label=\{t\("sidebar\.agentRunning"\)\}/);
  assert.match(fn("UnreadSessionIndicator"), /<Led status="done" label=\{t\("sidebar\.newSessionActivity"\)\}/);
});

test("the selected row has the orange trace; every state keeps the fixed row height", () => {
  const item = fn("SessionItem");
  assert.match(item, /height: SESSION_LIST_ITEM_HEIGHT/);
  assert.match(item, /isSelected && "border-l-tron-orange bg-\[linear-gradient\(90deg,rgb\(255_154_0\/0\.12\),transparent\)\]/);
  assert.match(item, /confirmDelete && "border-l-tron-red/);
});

test("rename uses the shared Tron field style", () => {
  assert.match(fn("SessionItem"), /className=\{cn\(fieldClass, "h-\[30px\] flex-1/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/session-sidebar-tron.test.mjs`
Expected: FAIL (`#ef4444` present).

- [ ] **Step 3: `ToolbarIconButton`, `PiWebTitle`, indicators**

- `ToolbarIconButton`: delete `enter` / `leave` and the mouse handlers. Remove the visual style keys
  (`background`, `border`, `color`, `cursor`, `borderRadius`, `opacity`, `transition`) and keep
  `position`, sizing and `marginRight`. Add
  `className="flex items-center justify-center text-text-dim transition-colors hover:bg-bg-hover hover:text-text-muted disabled:cursor-default disabled:opacity-60 focus-visible:shadow-glow-cyan outline-none"`.
  The `color` and `background` props stay in the signature (callers pass them); apply them only
  when they differ from the defaults: `style={{ …layout, ...(color !== "var(--text-dim)" ? { color } : {}), ...(background !== "none" ? { background } : {}) }}`.
  When `skipHover`, add `hover:bg-transparent` via `cn`.
- `PiWebTitle`: drop the visual inline styles; keep `minWidth: "6ch"`. Add
  `className={cn("cursor-default bg-transparent p-0 font-hud text-[13px] font-bold uppercase tracking-[0.2em]", showVersion ? "text-tron-cyan" : "text-white [text-shadow:0_0_10px_rgb(0_216_255/0.45)]")}`.
- `RunningSessionIndicator` returns:
  `<span className="inline-flex size-3.5 shrink-0 items-center justify-center" title={t("sidebar.agentRunning")}><Led status="running" label={t("sidebar.agentRunning")} /></span>`.
  The aria label moves from the wrapper to the `Led`; the wrapper keeps `title` only.
- `UnreadSessionIndicator` returns the same shape with
  `<Led status="done" label={t("sidebar.newSessionActivity")} className="animate-pulse motion-reduce:animate-none" />`
  and `title={t("sidebar.newActivity")}`.
- `showProjectActivity`: spinner SVG → `<Led status="running" />`. `#0891b2` → `text-tron-cyan`, and
  its dot → `<Led status="done" />`. Keep the counts and aria-labels.

- [ ] **Step 4: Session rows**

In `SessionItem`'s outer `div`:
- **Keep in `style`:** `height`, `display`, `alignItems`, `paddingLeft` / `paddingRight`, `gap`,
  `overflow`, `opacity`.
- **Move to `className`:**
  ```tsx
  className={cn(
    "session-row cursor-pointer border-l-2 border-l-transparent transition-colors",
    !isSelected && !confirmDelete && "hover:bg-bg-hover",
    isSelected && "border-l-tron-orange bg-[linear-gradient(90deg,rgb(255_154_0/0.12),transparent)] text-white shadow-[-6px_0_12px_-6px_var(--color-tron-orange)]",
    confirmDelete && "border-l-tron-red bg-tron-red/5",
    (confirmDelete || renaming) && "cursor-default",
  )}
  ```
  Delete `hovered` / `setHovered` and the `onMouseEnter` / `onMouseLeave` props if nothing else
  reads `hovered`. Run `rg -n "hovered" components/SessionSidebar.tsx` first. If another branch
  reads it, keep the state and only drop its use in `background`.
- **Delete confirm button:**
  `className="flex h-[30px] items-center gap-1 bg-tron-red px-[11px] text-xs font-semibold text-black whitespace-nowrap hover:shadow-[0_0_10px_rgb(255_77_94/0.6)]"`.
  The trash SVG becomes lucide `Trash2` (`size-3`). **Cancel:**
  `className="flex h-[30px] items-center border border-tron-line bg-black px-[11px] text-xs text-text-muted whitespace-nowrap hover:text-text"`.
  Remove their visual inline styles.
- **Rename input:** `className={cn(fieldClass, "h-[30px] flex-1 px-2 text-xs border-tron-cyan")}`.
  Remove its inline style.
- **Subagent icon:** the SVG becomes lucide `Bot` with `className="size-[11px] shrink-0 text-tron-cyan"`.
- **Time / meta texts** in the normal view: keep their structure. Numbers and relative times get
  `font-mono` if they are not already.
- **`sessionStripButtonStyle` / `sessionMoreButtonStyle`:** keep the size keys. Set
  `borderRadius: 0`, `border: "1px solid var(--color-tron-line)"`, `background: "#000"`.

- [ ] **Step 5: Search field and remaining colors**

- **Search input:** replace its className with
  `cn(fieldClass, "mt-[6px] block h-[29px] text-xs")`. Keep the other attributes.
- **Remaining off-palette colors:** every `#ef4444` / `#dc2626` / `rgba(239,68,68,…)` left in the
  file becomes `var(--color-tron-red)` (or `color-mix(in srgb, var(--color-tron-red) 6%, transparent)`
  for backgrounds). Every `#d97706` becomes `var(--color-tron-orange)`. Every `#0891b2` becomes
  `var(--color-tron-cyan)`.
- Run `rg -n '#[0-9a-fA-F]{6}\b|rgba\(' components/SessionSidebar.tsx`. The only matches left
  should be neutral shadows (`rgba(0,0,0,…)`).

- [ ] **Step 6: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/session-sidebar-tron.test.mjs components/SessionSidebar.test.mjs components/SessionSidebar.file-search.test.mjs components/SessionSidebar.project-identity.test.mjs components/SessionSidebar.worktree.test.mjs components/AppShell.sidebar-breakpoint.test.mjs components/AppShell.session-delete.test.mjs`
Expected: PASS. Rewrite a pinned visual-only assertion (e.g. `borderTop: "1px solid var(--border)"`,
if that element changed) to the new class carrying the same intent, and list it in the commit body.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/SessionSidebar.tsx components/*.test.mjs
git commit -m "feat(ui): Tron session sidebar: HUD title, orange active trace, LED indicators"
```

---

### Task 4: Lot gate and review

- [ ] **Step 1: Full gate**

```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test 2>&1 | tail -15
```
Expected: 0 failures.

- [ ] **Step 2: Fresh review.** Subagent on `claude-bridge/claude-opus-5-5:high` over
  `<base of Task 1>..HEAD`, with this plan, the spec and the Review Focus above.

- [ ] **Step 3: Visual check by the user.** `http://192.168.1.182:30141/` on desktop and phone:
  top bar, rail, sidebar, delete confirm (Backspace on a focused row), rename (F2).
