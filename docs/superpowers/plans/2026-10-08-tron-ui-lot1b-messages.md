# Tron UI — Lot 1b: Messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the message stream to the approved mockup:
- a chamfered orange user message and a cyan-traced assistant reply
- compact tool-call cards with a status LED, the scan bar while running and red on failure
- a streaming cursor
- the perspective grid behind the messages
- Tron colors for code mode, results, thinking, branches, the minimap, the drop zone and code
  blocks

**Architecture:**
- Visual-first, as in Lot 1a. Only visible styling changes. Layout inline styles, `data-*`,
  `aria-*`, handlers and render conditions stay.
- Tool cards gain a `data-status` attribute, so tests pin the state rather than the border color.

**Tech Stack:** Lot 0 primitives (`Chamfer`, `ScanBar`, `StreamCursor`, `PerspectiveGrid`, `Led`,
`cn`), Tailwind v4 tokens.

**Spec:** [docs/superpowers/specs/2026-10-08-tron-ui-design.md](../specs/2026-10-08-tron-ui-design.md).
Mockup: [2026-10-08-tron-ui-mockup.html](../specs/2026-10-08-tron-ui-mockup.html).

**Plan shape:** same as Lot 1a. New code is complete; edits to existing call sites are given as
anchored transformation rules.

## Global Constraints

Identical to Lot 1a ([2026-10-08-tron-ui-lot1a-frame.md](2026-10-08-tron-ui-lot1a-frame.md),
"Global Constraints"), plus the following:

- **Color map for this lot:**

  | Old color(s) | Meaning | New |
  |---|---|---|
  | greens `#16a34a`, `#10b981`, `rgba(34,197,94,…)` | success | cyan |
  | `#f87171`, `#ef4444`, `#dc2626`, `rgba(248,113,113,…)`, `rgba(239,68,68,…)` | error | red |
  | `#d97706`, `#ca8a04`, `rgba(234,179,8,…)` | warning / running | orange |
  | blues `rgba(37,99,235,…)`, `rgba(59,130,246,…)`, `rgba(96,165,250,…)` | accent | cyan |
  | `rgba(128,128,128,…)` (minimap) | neutral | cyan at the same alphas |

  Neutral black shadows stay.
- **Readability first:** the grid sits behind the text at reduced opacity (`opacity-50`). It never
  goes above message content.
- **Final review:** fresh subagent on `claude-bridge/claude-opus-5-5:high`.

## Review Focus

1. **A user message longer than 300 px** still scrolls inside its box (`USER_BUBBLE_MAX_HEIGHT`),
   and the chamfer does not clip the scrollbar thumb into invisibility. Pinned in Task 1, Step 1
   (inner box keeps max-height + overflow).
2. **Editing a user message** (the `isEditing` branch) is visually distinct: the orange glow is on.
   Pinned in Task 1, Step 1.
3. **A tool card in each status:**
   - running → orange edge and scan bar
   - failed → red edge
   - done → cyan LED
   - no result / awaiting → dim

   Screen-reader words stay unchanged. Pinned in Task 2, Step 1.
4. **`prefers-reduced-motion`:** the scan bar and the stream cursor do not animate. Already
   pinned by Lot 0 CSS; Task 2 uses `ScanBar`, so nothing new is needed.
5. **`Chamfer` with `cut` ≤ 1** stays a valid polygon (deferred Lot 0 minor). Pinned in Task 1,
   Step 1.

---

### Task 1: User and assistant messages, streaming cursor, Chamfer floor

**Files:**
- Modify: `components/tron/index.tsx` (`Chamfer`: floor `cut` at 2, accept `innerStyle`)
- Modify: `components/MessageView.tsx`. Anchors: `UserMessageView` bubble `div` (the one with
  `maxHeight: USER_BUBBLE_MAX_HEIGHT`), its image border `rgba(59,130,246,0.15)`,
  `AssistantMessageView` model-label `div`, the `tps` badge, the blocks container
  `<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>`, `providerError` /
  warning boxes (`rgba(239,68,68,…)`, `rgba(234,179,8,…)`, `#ca8a04`), `compactError`
  `#ef4444`
- Test: create `components/message-tron.test.mjs`; append to `components/tron/tron.test.mjs`

**Interfaces:**
- Produces: `Chamfer` gains `innerStyle?: CSSProperties` (applied to the inner black layer). Its
  `cut` is floored at 2 px.

- [ ] **Step 1: Write the failing tests**

Append to `components/tron/tron.test.mjs`:
```js
test("Chamfer floors cut at 2px and forwards innerStyle", () => {
  const out = html(h(Chamfer, { cut: 0, innerStyle: { maxHeight: 300, overflowY: "auto" } }, "x"));
  assert.match(out, /--cut:2px/);
  assert.match(out, /--cut:1px/);
  assert.match(out, /max-height:300px;overflow-y:auto/);
});
```

`components/message-tron.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MessageView } = await jiti.import("./MessageView.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const source = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");
const h = React.createElement;
const render = (message, props = {}) => renderToStaticMarkup(h(I18nProvider, null, h(MessageView, { message, ...props })));

test("user message is an orange chamfer that keeps its scroll cap", () => {
  const html = render({ role: "user", content: "hello", timestamp: Date.now() });
  assert.match(html, /tron-chamfer/);
  assert.match(html, /bg-tron-orange/);
  assert.match(html, /max-height:300px/);
  assert.match(html, /overflow-y:auto/);
});

test("editing a user message turns the chamfer glow on", () => {
  assert.match(source, /<Chamfer tone="orange" glow=\{isEditing\}/);
});

test("assistant reply has the cyan trace, a HUD model label and a cursor while streaming", () => {
  const message = { role: "assistant", provider: "anthropic", model: "claude-test", content: [{ type: "text", text: "hi" }] };
  const idle = render(message);
  assert.match(idle, /border-tron-cyan/);
  assert.match(idle, /font-hud/);
  assert.doesNotMatch(idle, /tron-cursor/);
  assert.match(render(message, { isStreaming: true }), /tron-cursor/);
});

test("no off-palette colors remain in MessageView", () => {
  assert.doesNotMatch(source, /#16a34a|#f87171|#ef4444|#ca8a04|#53b3cb|#9bc53d|#f9c22e|#e01a4f|rgba\((34,197,94|248,113,113|239,68,68|234,179,8|59,130,246|96,165,250)/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/tron/tron.test.mjs components/message-tron.test.mjs`
Expected: FAIL. The "no off-palette" test stays red until Task 2 also lands; Task 1 makes the
other three pass.

- [ ] **Step 3: `Chamfer` floor and `innerStyle`**

In `components/tron/index.tsx`, `Chamfer` signature adds `innerStyle?: CSSProperties`. The body
computes `const edge = Math.max(2, cut);`, uses `` `${edge}px` `` and `` `${edge - 1}px` `` for the
two `--cut` values, and spreads `innerStyle` into the inner layer's style:
`style={{ "--cut": \`${edge - 1}px\`, ...innerStyle } as CSSProperties}`.

- [ ] **Step 4: User bubble**

Replace the bubble `div` (the one with `maxHeight: USER_BUBBLE_MAX_HEIGHT`) with:
```tsx
<Chamfer tone="orange" glow={isEditing} cut={10} className="min-w-0 flex-1" innerClassName="text-text" innerStyle={{
  padding: "8px 12px",
  fontSize: "calc(14px + var(--chat-font-size-offset, 0px))",
  lineHeight: 1.6,
  wordBreak: "break-word",
  maxHeight: USER_BUBBLE_MAX_HEIGHT,
  overflowY: "auto",
  background: isEditing ? "color-mix(in srgb, var(--color-tron-orange) 12%, #000)" : "var(--user-bg)",
}}>
  …unchanged children…
</Chamfer>
```
The image border `rgba(59,130,246,0.15)` becomes `var(--color-tron-line)`. The command-name
button color `var(--accent)` stays (cyan).

- [ ] **Step 5: Assistant reply**

- **Model label `div`:** add
  `className="font-hud text-[9px] uppercase tracking-[0.16em] text-tron-cyan/80"`. Drop the
  `fontSize` and `color` style keys; keep the layout keys.
- **`tps` badge:**
  `const tone = tps >= 30 ? "var(--color-tron-cyan)" : tps >= 15 ? "var(--color-tron-orange)" : "var(--color-tron-red)";`.
  The badge style becomes `{ marginLeft: 6, padding: "1px 6px", background: tone, color: "#000", fontSize: 10, fontFamily: "var(--font-mono)" }`.
- **Blocks container:** gets
  `className="border-l border-tron-cyan pl-3.5 shadow-[-6px_0_10px_-8px_var(--color-tron-cyan)]"`.
  Keep its style. After the `blockItems.map(…)` add `{isStreaming && <StreamCursor />}`.
- **Error box** (`rgba(239,68,68,…)`, `#ef4444`): border
  `color-mix(in srgb, var(--color-tron-red) 30%, transparent)`, background
  `color-mix(in srgb, var(--color-tron-red) 7%, transparent)`, color `var(--color-tron-red)`.
- **Warning box** (`rgba(234,179,8,…)`, `#ca8a04`): the same with `--color-tron-orange`.
- **`compactError`:** `#ef4444` → `var(--color-tron-red)`.
- **Radii:** set any `borderRadius` on these boxes to `0`.

Imports: `Chamfer`, `StreamCursor` from `@/components/tron`.

- [ ] **Step 6: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/tron/tron.test.mjs components/message-tron.test.mjs components/MessageView.test.mjs`
Expected: the "no off-palette" test still fails (tool colors land in Task 2); everything else
passes.

- [ ] **Step 7: Commit**

```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/tron components/MessageView.tsx components/message-tron.test.mjs components/tron/tron.test.mjs
git commit -m "feat(ui): chamfered user messages, cyan assistant trace, streaming cursor"
```

---

### Task 2: Tool-call cards, code mode and results

**Files:**
- Modify: `components/MessageView.tsx`. Anchors: `ToolCallBlock` (outer card, header button, tool
  name span, `tool-status` span, chevron SVG, subagent open button, expanded `pre`, patch split
  container), `PairedDiffResult` border, `PatchTextView` hunk color `rgba(96,165,250,0.12)`,
  `ResultImages` / `PairedResult` borders and colors, `ThinkingBlock` container and error color.
- Modify: `components/CodemodeToolView.tsx` (`STATUS` colors, error color, `borderTop`)
- Modify: `app/globals.css` (`.tool-status-spinner` color → orange)
- Test: `components/message-tron.test.mjs` (append); `components/MessageView.test.mjs`
  (rewrite the four border assertions)

- [ ] **Step 1: Write the failing tests**

Append to `components/message-tron.test.mjs`:
```js
const statusBlock = { type: "toolCall", toolCallId: "call-tron-1", toolName: "read", input: { path: "/tmp/a" } };
const statusMessage = { role: "assistant", provider: "anthropic", model: "claude-test", content: [statusBlock] };
const result = (isError) => ({ role: "toolResult", toolCallId: statusBlock.toolCallId, toolName: "read", content: [{ type: "text", text: isError ? "ENOENT" : "ok" }], isError });

test("tool cards expose their status and draw it in Tron colors", () => {
  const running = render(statusMessage, { toolResults: new Map(), runningToolIds: new Set([statusBlock.toolCallId]), runActive: true });
  assert.match(running, /data-tool-status="running"/);
  assert.match(running, /tron-scan/);
  assert.match(running, /shadow-glow-orange/);
  const failed = render(statusMessage, { toolResults: new Map([[statusBlock.toolCallId, result(true)]]) });
  assert.match(failed, /data-tool-status="failed"/);
  assert.match(failed, /border-tron-red/);
  const done = render(statusMessage, { toolResults: new Map([[statusBlock.toolCallId, result(false)]]) });
  assert.match(done, /data-tool-status="done"/);
  assert.match(done, /data-status="done"/); // the Led
  assert.match(done, /text-tron-cyan/); // the tool name
});

test("code mode statuses use Tron colors", async () => {
  const codemode = await readFile(new URL("./CodemodeToolView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(codemode, /#d97706|#16a34a|#f87171|rgba\(/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/message-tron.test.mjs`
Expected: FAIL (`data-tool-status` missing).

- [ ] **Step 3: Tool card**

In `ToolCallBlock`:
- **Card state.** Compute
  `const cardState = status ?? (result ? (isError ? "failed" : "done") : "pending");`.
  `status` comes from `toolCallStatus` and is `null` when no word is shown. Keep `isError`
  precedence: `const cardTone = isError ? "failed" : cardState;`.
- **Outer card `div`:** remove `borderRadius`, `border` and `background` from its style; keep
  `overflow`, `fontSize`. Add:
  ```tsx
  data-tool-status={cardTone}
  className={cn(
    "border bg-black/90",
    cardTone === "running" && "border-transparent shadow-glow-orange",
    cardTone === "failed" && "border-tron-red/60 bg-tron-red/5",
    cardTone !== "running" && cardTone !== "failed" && "border-tron-line",
  )}
  ```
- **Header button:** drop `background`, `border`, `color`, `cursor`; add
  `className="text-text-muted outline-none hover:bg-bg-hover focus-visible:shadow-glow-cyan"`.
  Insert as the first child:
  `<Led status={cardTone === "running" ? "running" : cardTone === "failed" ? "error" : cardTone === "done" ? "done" : "idle"} />`.
- **Tool name span:** remove `color` from its style; add
  `className={isError ? "text-tron-red" : "text-tron-cyan"}`.
- **`tool-status` span:** `#f87171` → `var(--color-tron-red)`.
- **Chevron SVG:** `stroke="var(--text-dim)"` → `stroke="currentColor"` with
  `className="text-text-dim"`.
- **Subagent open button:** `borderLeft` → `1px solid var(--color-tron-line)`; add
  `className="hover:text-tron-cyan"`.
- **Scan bar.** Directly after the header row `div`, add
  `{cardTone === "running" && <ScanBar />}`.
- **Expanded `pre` `borderTop`:**
  `isError ? "1px solid color-mix(in srgb, var(--color-tron-red) 25%, transparent)" : "1px solid var(--color-tron-line)"`.
- **Patch split container `borderTop`:** `1px solid var(--color-tron-line)`.

Status words, `aria-expanded`, `tool-status-word` and `visually-hidden` stay exactly as they are.

- [ ] **Step 4: Results, diffs, thinking, code mode**

- **Results and diffs:**
  - `PairedDiffResult` and `PairedResult` `borderTop`: error →
    `color-mix(in srgb, var(--color-tron-red) 30%, transparent)`, else `var(--color-tron-line)`
  - error background → `color-mix(in srgb, var(--color-tron-red) 4%, transparent)`
  - error text → `var(--color-tron-red)`
  - `ResultImages`: the same mapping
  - `PatchTextView` hunk `rgba(96,165,250,0.12)` → `rgb(0 216 255 / 0.10)`
- **`ThinkingBlock` container:**
  - `borderRadius: 0`
  - `border: "1px solid var(--color-tron-line)"`
  - `background: "#000"`
  - error color `#f87171` → `var(--color-tron-red)`
- **`CodemodeToolView.tsx`:**
  - `STATUS` colors: running `var(--color-tron-orange)`, ok `var(--color-tron-cyan)`, error
    `var(--color-tron-red)`
  - call error text → red
  - `borderTop`: error `color-mix(in srgb, var(--color-tron-red) 25%, transparent)`, else
    `var(--color-tron-line)`
- **`app/globals.css`:** in `.tool-status-spinner`, set the colored border / color to
  `var(--color-tron-orange)`.

- [ ] **Step 5: Rewrite the pinned border assertions in `MessageView.test.mjs`**

- line ~212: `assert.match(html, /border:1px solid rgba\(34,197,94,0\.25\)/);` →
  `assert.match(html, /data-tool-status="done"/);`
- line ~442: `…rgba\(248,113,113,0\.45\)…` → `assert.match(html, /data-tool-status="failed"/);`
- line ~444: `doesNotMatch …34,197,94…` → `assert.doesNotMatch(html, /data-tool-status="done"/);`
- line ~686: `border:1px solid var\(--border\)` → `assert.match(running, /data-tool-status="running"/);`
- line ~697: `…34,197,94,0\.25…` → `assert.match(done, /data-tool-status="done"/);`

- [ ] **Step 6: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/message-tron.test.mjs components/MessageView.test.mjs components/tool-call-status.test.mjs`
(skip any file that does not exist). Expected: PASS, including Task 1's "no off-palette" test.

- [ ] **Step 7: Commit**

```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/MessageView.tsx components/CodemodeToolView.tsx app/globals.css components/message-tron.test.mjs components/MessageView.test.mjs
git commit -m "feat(ui): Tron tool cards with status LED and scan bar; Tron results and thinking" -m "Rewritten assertions: MessageView tool-card border colors → data-tool-status (same intent: the card state is done / failed / running)."
```

---

### Task 3: Perspective grid, chat surroundings, code blocks

**Files:**
- Modify: `components/ChatWindow.tsx`. Anchors:
  - the root `className="chat-content relative flex h-full …"` (add the grid)
  - the scroll container `className="scrollbar-subtle min-w-0 flex-1 …"` (raise above the grid)
  - the drop-zone block (`rgba(37,99,235,…)`)
  - phase colors `#ef4444` / `#d97706` / `#10b981`
  - `quoteError` `#dc2626`
- Modify: `components/BranchNavigator.tsx` (`rgba(37,99,235,…)`),
  `components/ChatMinimap.tsx` (`rgba(128,128,128,…)`)
- Modify: `app/globals.css`: `.markdown-code-header`, `.markdown-code-lang`, `.markdown-body th`,
  `.markdown-body blockquote`, and any `border-radius` on `.markdown-code-block`
- Test: create `components/chat-surroundings-tron.test.mjs`

- [ ] **Step 1: Write the failing test**

`components/chat-surroundings-tron.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const chat = await read("./ChatWindow.tsx");
const branches = await read("./BranchNavigator.tsx");
const minimap = await read("./ChatMinimap.tsx");
const css = await read("../app/globals.css");

test("the perspective grid sits behind the scrolling messages", () => {
  assert.match(chat, /<PerspectiveGrid className="z-0 opacity-50" \/>/);
  assert.match(chat, /className="scrollbar-subtle relative z-\[1\] min-w-0 flex-1/);
});

test("no off-palette colors remain around the chat", () => {
  for (const [name, source] of [["ChatWindow", chat], ["BranchNavigator", branches], ["ChatMinimap", minimap]]) {
    assert.doesNotMatch(source, /#ef4444|#dc2626|#d97706|#10b981|rgba\((37,99,235|128,128,128)/, name);
  }
});

test("code block headers are HUD labels", () => {
  const rule = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf("}", i)); };
  assert.match(rule(".markdown-code-lang"), /font-family: var\(--font-hud\)/);
  assert.match(rule(".markdown-code-lang"), /text-transform: uppercase/);
  assert.doesNotMatch(rule(".markdown-code-block"), /border-radius: [1-9]/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/chat-surroundings-tron.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **`ChatWindow.tsx`:**
  - import `PerspectiveGrid` from `@/components/tron`
  - insert `<PerspectiveGrid className="z-0 opacity-50" />` as the first child of the
    `chat-content` root
  - prefix the scroll container's className with `scrollbar-subtle relative z-[1] …` (keep the
    rest)
  - drop zone: `bg-[rgba(37,99,235,0.06)]` → `bg-[rgb(0_216_255/0.06)]` and
    `border-[rgba(37,99,235,0.5)]` → `border-[rgb(0_216_255/0.5)]`; the shadow
    `rgba(37,99,235,0.18)` → `rgb(0_216_255/0.18)`; the SVG `rgba(37,99,235,X)` →
    `rgb(0 216 255 / X)` (same alphas)
  - phase colors: `#ef4444` → `var(--color-tron-red)`, `#d97706` → `var(--color-tron-orange)`,
    `#10b981` → `var(--color-tron-cyan)`
  - `quoteError` `#dc2626` → `var(--color-tron-red)`
- **`BranchNavigator.tsx`:** the user-role background `rgba(37,99,235,0.08)` →
  `rgb(255 154 0 / 0.08)` and its border `rgba(37,99,235,0.2)` → `rgb(255 154 0 / 0.3)`. User
  = orange, consistent with the user message.
- **`ChatMinimap.tsx`:** the `rgba(128,128,128,A)` values → `rgb(0 216 255 / A')` with
  A' = 0.35 active / 0.12 idle fill, and 0.9 / 0.45 border.
- **`globals.css`:**
  - `.markdown-code-header`: border-bottom `1px solid var(--color-tron-line)`
  - `.markdown-code-lang`: `font-family: var(--font-hud); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-tron-cyan);`
  - `.markdown-code-block`: `border-radius: 0` and border `1px solid var(--color-tron-line)`
  - `.markdown-body th`: `color: var(--color-tron-cyan)`
  - `.markdown-body blockquote`: `border-left-color: var(--color-tron-cyan)`

- [ ] **Step 4: Run the tests**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/chat-surroundings-tron.test.mjs components/ChatWindow.*.test.mjs components/BranchNavigator.test.mjs components/ChatMinimap.test.mjs components/MarkdownBody.test.mjs`
Expected: PASS. Rewrite any pinned visual-only assertion to the new value and list it in the
commit body.

- [ ] **Step 5: Commit**

```bash
node_modules/.bin/tsc --noEmit && npm run lint
git add components/ChatWindow.tsx components/BranchNavigator.tsx components/ChatMinimap.tsx app/globals.css components/chat-surroundings-tron.test.mjs components/*.test.mjs
git commit -m "feat(ui): perspective grid behind the chat; Tron drop zone, branches, minimap, code blocks"
```

---

### Task 4: Lot gate and review

- [ ] **Full gate:** `tsc`, lint, `npm test` (0 failures).
- [ ] **Fresh review** on `claude-bridge/claude-opus-5-5:high` over `<Task 1 base>..HEAD`, with this
  plan, the spec, and the Review Focus.
- [ ] **One fix pass** for Critical / Important (TDD). Minors go to the ledger.
- [ ] **User visual check:**
  - a long user message
  - edit a message
  - a running tool, a failed tool
  - a streaming reply
  - a code block
  - drag a file over the chat
