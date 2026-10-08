# Tron UI — Lot 1c: Composer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the composer into the mockup's floating chamfered dock:
- cyan glow, orange while steering is possible
- an orange send action
- Tron steer / follow-up buttons
- a class-based control bar (`ComposerChip`) with lucide icons
- Tron dropdown menus, banners and queued-message chips
- Tron colors in the model and agent-profile selectors

**Architecture:**
- Visual-first, as in Lots 1a and 1b.
- A new `ComposerChip` replaces about ten hand-styled buttons with JS hover handlers.
- The composer shell keeps its flex layout inside a `Chamfer` (non-compact mode only). The compact
  quote dialog keeps its plain layout.

**Spec / mockup:** [spec](../specs/2026-10-08-tron-ui-design.md), [mockup](../specs/2026-10-08-tron-ui-mockup.html).
Global Constraints and plan shape are identical to [Lot 1a](2026-10-08-tron-ui-lot1a-frame.md). The
color map is identical to [Lot 1b](2026-10-08-tron-ui-lot1b-messages.md), plus indigo
`rgba(129,140,248,…)` / `rgba(99,102,241,…)` (follow-up) → cyan, and emerald
`rgba(16,185,129,…)` / `rgba(5,150,105,…)` (success) → cyan.

## Review Focus

1. **Compact mode** (the quote dialog's composer): no chamfer, no glow, layout unchanged. Pinned in
   Task 2, Step 1.
2. **Streaming with steer/follow-up available:** the dock turns orange, and Stop stays reachable
   and red. Pinned in Task 2, Step 1.
3. **Mobile controls menu:** opening it still hides the "more" button from focus/AT
   (`aria-hidden`, `tabIndex -1`). Collapse still closes both dropdowns. Pinned by the existing
   `ChatInput.mobile-thinking-menu.test.mjs` plus Task 1, Step 1.
4. **Disabled send** (empty draft): no orange, no pointer, no hover change. Pinned in Task 2,
   Step 1.
5. **Dropdown menus** open above the composer and are not clipped by the chamfer: they are
   siblings of the shell, outside it. Pinned in Task 2, Step 1 (the chamfer wraps only the
   textarea row).

---

### Task 1: `ComposerChip` and the control bar

**Files:**
- Create: `components/composer/ComposerChip.tsx`, `components/composer/composer.test.mjs`
- Modify: `components/ChatInput.tsx`. Anchors: the attach button (`fileInputRef.current?.click()`),
  the mobile "more controls" button, the thinking trigger, the tools trigger, the compact button,
  the Stop button (`onClick={onAbort}`), the sound button, the mobile collapse button. Also the
  three menus: thinking dropdown, tools dropdown with its preset rows, and the mobile controls
  panel (`position: "absolute", right: 0, bottom: 0, zIndex: 60`).

**Interfaces:**
- Produces: `ComposerChip`, with props
  `ComponentProps<"button"> & { active?: boolean; tone?: "default" | "danger" | "accent"; iconOnly?: boolean }`.
  It defaults to `type="button"`, `h-8`, uses `enabled:hover:` states, mono label text and no
  radius.
- Also produces: `const composerMenuClass = "z-[100] overflow-hidden border border-tron-line bg-black shadow-glow-cyan"`,
  exported from the same file.

- [ ] **Step 1: Write the failing tests**

`components/composer/composer.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ComposerChip } = await jiti.import("./ComposerChip.tsx");
const input = await readFile(new URL("../ChatInput.tsx", import.meta.url), "utf8");
const h = React.createElement;

test("ComposerChip: typed button, hover only when enabled, danger and active tones", () => {
  const idle = renderToStaticMarkup(h(ComposerChip, null, "x"));
  assert.match(idle, /^<button[^>]*type="button"/);
  assert.match(idle, /enabled:hover:text-text/);
  assert.doesNotMatch(idle, /(^|\s)hover:/);
  assert.match(renderToStaticMarkup(h(ComposerChip, { tone: "danger" }, "x")), /text-tron-red/);
  assert.match(renderToStaticMarkup(h(ComposerChip, { active: true }, "x")), /bg-bg-hover/);
});

test("the control bar has no JS hover handlers", () => {
  const start = input.indexOf("{/* Bottom bar: left | center (context) | right */}");
  const bar = input.slice(start, input.indexOf("</fieldset>", start));
  assert.doesNotMatch(bar, /onMouseEnter|onMouseLeave/);
  assert.match(bar, /<ComposerChip/);
});

test("composer menus share the Tron menu class", () => {
  assert.ok((input.match(/composerMenuClass/g) ?? []).length >= 4, "thinking, tools, history, mobile panel");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/composer/composer.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ComposerChip`**

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const composerMenuClass = "z-[100] overflow-hidden border border-tron-line bg-black shadow-glow-cyan";

const TONES = {
  default: "text-text-muted enabled:hover:text-text",
  danger: "text-tron-red enabled:hover:bg-tron-red/15",
  accent: "text-tron-cyan enabled:hover:text-tron-cyan",
} as const;

type ComposerChipProps = ComponentProps<"button"> & { active?: boolean; tone?: keyof typeof TONES; iconOnly?: boolean };

export function ComposerChip({ active = false, tone = "default", iconOnly = false, className, type, ...props }: ComposerChipProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap bg-transparent font-mono text-xs outline-none transition-colors enabled:hover:bg-bg-hover focus-visible:shadow-glow-cyan disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3 [&_svg]:shrink-0",
        iconOnly ? "w-8 p-0" : "px-3",
        TONES[tone],
        active && "bg-bg-hover text-text",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Convert the control bar**

For each anchored button:
- `<button` → `<ComposerChip`
- delete `onMouseEnter` / `onMouseLeave`
- delete visual style keys (`background`, `border`, `borderRadius`, `color`, `cursor`, `opacity`,
  `transition`, `fontSize`)
- keep `width`, `height`, `padding` (mobile `"0 6px"`), `visibility`, `pointerEvents`,
  `marginLeft`
- keep every `title`, `aria-*`, `tabIndex`, `disabled` and `onClick`

Mapping:
- **Attach:** `active={attachedImages.length > 0}`, `tone={attachedImages.length ? "accent" : "default"}`,
  `iconOnly`, icon `ImagePlus`.
- **Mobile more:** keep `width: "100%"`, `visibility`, `pointerEvents`.
- **Thinking:** `active={thinkingDropdownOpen}`, icon `Brain`. **Tools:** `active={toolDropdownOpen}`,
  icon `Wrench`.
- **Compact:** `tone={isCompacting ? "danger" : "default"}`, icons `Square` (compacting, `fill`
  currentColor) / `Minimize2`.
- **Stop:** `tone="danger"`, `className="border border-tron-red/60 px-3.5 font-semibold"`, icon
  `Square` with `className="fill-current"`.
- **Sound:** `iconOnly`, `className={soundEnabled ? undefined : "opacity-55"}`, icons `Volume2` /
  `VolumeX`.
- **Collapse:** `iconOnly`, `className="w-9 border-l border-tron-line bg-bg-hover"`, icon `X`.

**Menus:**
- The thinking dropdown, tools dropdown, history menu (`historyMenuRef`) and mobile controls panel
  get `className={composerMenuClass}`.
- Delete their `background`, `border`, `borderRadius`, `boxShadow`, `backdropFilter` and
  `zIndex: 100` style keys.
- The mobile panel keeps `zIndex: 60`, written as an inline style that overrides the class.
- The history menu keeps `zIndex: 120` inline.

**Tool preset rows:**
- Delete the hover handlers. Add
  `className={cn("enabled:hover:bg-bg-hover", isActive && "bg-bg-selected text-text font-semibold")}`
  and remove the matching style keys.
- The active check SVG: `stroke="currentColor"` with `className="text-tron-cyan"`.

Imports: `ComposerChip`, `composerMenuClass` from `./composer/ComposerChip`. From `lucide-react`:
`ImagePlus`, `Brain`, `Wrench`, `Minimize2`, `Square`, `Volume2`, `VolumeX`, `X`. Plus `cn`.

- [ ] **Step 5: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/composer/composer.test.mjs components/ChatInput.test.mjs components/ChatInput.mobile-thinking-menu.test.mjs components/ChatInput.streaming-thinking.test.mjs components/ChatInput.dormancy.test.mjs components/ChatInput.draft-restored.test.mjs`
Expected: PASS. Rewrite any pinned visual-only assertion to the same intent and list it in the
commit body.

- [ ] **Step 6: Commit**
```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/composer components/ChatInput.tsx components/ChatInput*.test.mjs
git commit -m "feat(ui): Tron composer control bar: ComposerChip, lucide icons, Tron menus"
```

---

### Task 2: Chamfered dock, send / steer / follow-up, banners, selectors

**Files:**
- Modify: `components/ChatInput.tsx`. Anchors:
  - the shell `div` with `borderRadius: compact ? 0 : 14`
  - the send button (`onClick={handleSend}`)
  - the steer / follow-up buttons
  - `QueuedMessageRow`
  - `ModelNoticeBanner`
  - the retry banner (`retryInfo`), `compactResultText`, `compactError`
  - remaining off-palette colors
- Modify: `components/ModelSelector.tsx`, `components/SelectorRow.tsx`,
  `components/AgentProfileSelector.tsx` (their `rgba(...)` and JS hover)
- Test: `components/composer/composer.test.mjs` (append)

- [ ] **Step 1: Write the failing tests**

Append:
```js
const { ChatInput } = await jiti.import("../ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const renderInput = (props = {}) => renderToStaticMarkup(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false, ...props })));

test("the dock is a cyan chamfer, orange while steering is possible, plain in compact mode", () => {
  const idle = renderInput();
  assert.match(idle, /tron-chamfer/);
  assert.match(idle, /bg-tron-cyan/);
  const steering = renderInput({ isStreaming: true, onSteer() {}, onFollowUp() {} });
  assert.match(steering, /bg-tron-orange/);
  assert.match(input, /compact \? \(/); // compact keeps the plain shell branch
});

test("send is orange only with content; disabled send has no hover change", () => {
  assert.match(input, /hasDraft \? "bg-tron-orange text-black enabled:hover:shadow-glow-orange" : "bg-bg-panel text-text-dim"/);
});

test("the chamfer wraps only the textarea row, menus stay outside it", () => {
  const shell = input.slice(input.indexOf("<Chamfer"), input.indexOf("</Chamfer>"));
  assert.doesNotMatch(shell, /historyMenuRef|thinkingDropdownOpen &&|toolDropdownOpen &&/);
});

test("no off-palette colors remain in the composer and selectors", async () => {
  for (const file of ["../ChatInput.tsx", "../ModelSelector.tsx", "../SelectorRow.tsx", "../AgentProfileSelector.tsx"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(src, /#ef4444|rgba\((239,68,68|234,179,8|180,130,0|129,140,248|99,102,241|16,185,129|5,150,105|59,130,246|37,99,235)/, file);
    assert.doesNotMatch(src, /rgba\(\$\{color\}/, file);
  }
});
```
If `ChatInput` cannot be rendered with these minimal props (required props missing), add the
smallest set of no-op props the type demands. Do not mock modules.

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/composer/composer.test.mjs`
Expected: the four new tests FAIL.

- [ ] **Step 3: Implement**

**Shell.**
- Compute `const steering = isStreaming && Boolean(onSteer || onFollowUp);` and
  `const hasDraft = Boolean(value.trim() || attachedImages.length);`.
- Wrap the shell `div` as
  `compact ? (<div …existing plain style…>{row}</div>) : (<Chamfer tone={steering ? "orange" : "cyan"} glow cut={12} innerStyle={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", minWidth: 0, padding: isMobile ? "6px 6px 6px 12px" : "10px 10px 10px 14px", background: bashMode ? "var(--tool-bg)" : "#000" }}>{row}</Chamfer>)`.
- `row` is the existing textarea plus the action area. Extract it into a local
  `const composerRow = (<>…</>);` defined right before the return expression, so both branches
  use it.
- The compact branch keeps the exact current compact styles. Drop the non-compact border /
  radius / shadow keys, which are no longer reachable.

**Send.**
- `className={cn("flex shrink-0 items-center justify-center gap-1.5 self-end font-semibold text-[13px] outline-none transition-shadow focus-visible:shadow-glow-cyan disabled:cursor-not-allowed", hasDraft ? "bg-tron-orange text-black enabled:hover:shadow-glow-orange" : "bg-bg-panel text-text-dim")}`.
- Keep the inline size: mobile `width/height 36`, desktop `padding: "7px 14px"`.
- Remove the other visual style keys. Icon `SendHorizontal`.

**Steer / follow-up.**
- Steer: `className={cn("flex items-center gap-1.5 border border-tron-orange/50 px-3 py-[7px] text-[13px] font-semibold outline-none focus-visible:shadow-glow-cyan disabled:cursor-not-allowed", canQueueStreamingMessage ? "bg-tron-orange/15 text-tron-orange enabled:hover:bg-tron-orange/25" : "text-text-dim")}`.
- Follow-up: the same with `tron-cyan`.
- Drop their visual style keys. Icons `ArrowRight` / `ArrowUpToLine`.

**`QueuedMessageRow`.** Chip `borderRadius: 0`. Steer border
`color-mix(in srgb, var(--color-tron-orange) 50%, transparent)`, color
`var(--color-tron-orange)`.

**`ModelNoticeBanner`.**
- `const color = tone === "error" ? "var(--color-tron-red)" : "var(--color-tron-orange)";`
- border `` `1px solid color-mix(in srgb, ${color} 30%, transparent)` ``
- background `` `color-mix(in srgb, ${color} 7%, transparent)` ``
- `color: color`, `borderRadius: 0`

**Banners.**
- Retry → orange: border 25%, background 8%.
- Compact result → cyan.
- `compactError` → red.
- Every banner `borderRadius: 0`.

**Selectors** (`ModelSelector`, `SelectorRow`, `AgentProfileSelector`):
- replace each `rgba(…)` accent/selection color with the cyan token at the same alpha
- move JS hover to `enabled:hover:bg-bg-hover` classes
- set radii to 0 on triggers and menus
- keep the `variant: "field"` `background:var(--bg-panel)` (pinned) and the active row without
  `border-left` (pinned)

- [ ] **Step 4: Run the tests**

Run the Task 1 Step 5 command plus `components/composer/composer.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/ChatInput.tsx components/ModelSelector.tsx components/SelectorRow.tsx components/AgentProfileSelector.tsx components/composer
git commit -m "feat(ui): chamfered composer dock, orange send, Tron steer/follow-up, banners and selectors"
```

---

### Task 3: Lot gate and review

- [ ] **Full gate:** `tsc`, lint, `npm test` (0 failures).
- [ ] **Fresh review** on `claude-bridge/claude-opus-5-5:high` over `<Task 1 base>..HEAD`, with the
  Review Focus.
- [ ] **One fix pass** for Critical / Important (TDD). Minors go to the ledger.
- [ ] **User visual check:**
  - empty, typed and streaming states
  - steer / follow-up
  - the thinking / tools menus
  - mobile controls
  - the quote dialog composer
