# Agent Conversation View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a long-term agent's thread read like a Slack/Discord direct message (author groups, hidden tool calls, system lines, presence header) and turn the 44 px agent rail into an expandable conversation list, with readability as the first criterion.

**Architecture:** One stable boolean prop `conversation` on `MessageView` switches the user and assistant views to a plain, left-aligned layout and tags every assistant block with `data-block` / `data-tool`. `ChatWindow` sets `data-chat-style="agent"` and `data-agent-details="on|off"` on its scroll container, inserts group headers, and swaps the process group for a bare wrapper. `app/agent-conversation.css` does the hiding and the typography. Pure helpers under `components/agents/conversation/` hold every rule that can be tested without a DOM.

**Tech Stack:** Next.js (Turbopack dev), React 19 client components, Tailwind v4 + plain CSS, `node:test` + `jiti` for `.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-09-agent-conversation-design.md`

## Global Constraints

- Agent view only: ordinary sessions render byte-for-byte as before (no `conversation` prop, no data attributes).
- UI only: no API route, server logic, session format, runtime or permission change; no new poll; no new npm dependency.
- Browser floor Safari/iOS 16.4: `:has()` is allowed; no RegExp lookbehind in client code.
- Every visible string through `useI18n()`, key present in all four of `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts`. zh-CN calls an agent 智能体, zh-TW 智慧代理.
- Colours: only black, white and the Tron hues (`var(--color-tron-cyan|orange|red)`, `--text*`, `--border`, `--bg*`). No new hex literal.
- Information never carried by colour alone; keyboard reachable; visible focus; `prefers-reduced-motion: reduce` honoured.
- Escape in any new popover calls `preventDefault()`.
- `MessageView` is `memo()`ed: the only new prop is the boolean `conversation`, added to the comparator.
- Tests: `.test.mjs`, no TypeScript syntax, `node:test`, helpers loaded through `jiti`. Run from inside pi with `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG"`.
- Gates per task: `node_modules/.bin/tsc --noEmit`, `npm run lint`, the task's tests. Final task: full suite (one known pre-existing failure: `lib/codemode-settings.test.mjs` "the mode is read as the codemode extension reads it").
- Conventional Commits, no AI attribution, explicit `git add <paths>`. Never `next build`. Never commit the generated `BEGIN:nextjs-agent-rules` block of `AGENTS.md`.

## Review Focus

1. **A turn whose process holds only tool calls, with details off**: once finished, nothing of it renders (no header, no gap); while live, the agent's header is followed only by the "is working…" line, and tool-only messages take no height (`display: none`). Pinned by the CSS rule test in Task 3 and the `hasSpeechAct` / `data-process` assertions in Task 6.
2. **A search hit or `?agent=&entry=` deep link inside a hidden process group**: the group shows (today's `revealProcess`) instead of the scroll silently failing. Pinned in Task 6 (`revealProcess` keeps the `ProcessDetailsGroup` branch).
3. **An ordinary (non-agent) session**: nothing changes. Pinned in Task 2 (`conversation` defaults to false, no wrapper) and Task 6 (attributes only when `conversation`).
4. **Rail order and shortcuts in the expanded list**: `Ctrl+Alt+n` still targets the n-th agent. Pinned in Task 7 (same `agents.map` order, index-based title kept).
5. **Corrupt or absent `localStorage` values** for the two prefs: details falls back to off, the rail to the viewport rule. Pinned in Task 1 (`readDetails`, `readRailExpanded`).

---

### Task 1: Pure helpers (grouping, presence, list time, prefs)

**Files:**
- Create: `components/agents/conversation/author-groups.ts`
- Create: `components/agents/conversation/presence.ts`
- Create: `components/agents/conversation/list-time.ts`
- Create: `components/agents/conversation/prefs.ts`
- Test: `components/agents/conversation/conversation-helpers.test.mjs`

**Interfaces:**
- Consumes: `AGENT_EVENT_UI_TYPE` from `lib/agents/events.ts`, `RECALL_UI_TYPE` from `lib/agents/recall-card.ts`, `AgentState` from `lib/agents/agent-view.ts` (relative imports only: jiti does not resolve `@/`).
- Produces:
  - `type Author = "agent" | "user" | "system"`
  - `GROUP_GAP_MS = 300_000`
  - `authorOf(message: { role: string; customType?: string }, options?: { eventPrompt?: boolean }): Author | null`
  - `createGroupTracker(gapMs?: number): { open(author: Author, at: number | undefined, breaks?: boolean): boolean; last(): Author | null }`
  - `type PresenceKey = "needsInput" | "working" | "failed" | "paused" | "quietHours" | "available"`
  - `presenceOf(input: { state: AgentState; paused: boolean; globalPaused: boolean; quietHours: boolean }): { key: PresenceKey; tone: "orange" | "cyan" | "red" | "dim" }`
  - `formatListTime(iso: string, locale: string, now?: Date): string`
  - `DETAILS_KEY = "pi-agent-details"`, `RAIL_EXPANDED_KEY = "pi-agent-rail-expanded"`
  - `readDetails(raw: string | null): boolean`, `readRailExpanded(raw: string | null, viewportWidth: number): boolean`
  - `loadDetails(): boolean`, `loadRailExpanded(): boolean`, `savePref(key: string, value: boolean): void`

- [ ] **Step 1: Write the failing test**

`components/agents/conversation/conversation-helpers.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { authorOf, createGroupTracker, GROUP_GAP_MS } = await jiti.import("./author-groups.ts");
const { presenceOf } = await jiti.import("./presence.ts");
const { formatListTime } = await jiti.import("./list-time.ts");
const { readDetails, readRailExpanded } = await jiti.import("./prefs.ts");

test("authorOf maps roles; recall cards and tool results are ignored; event prompts are system", () => {
  assert.equal(authorOf({ role: "user" }), "user");
  assert.equal(authorOf({ role: "user" }, { eventPrompt: true }), "system");
  assert.equal(authorOf({ role: "bashExecution" }), "user");
  assert.equal(authorOf({ role: "assistant" }), "agent");
  assert.equal(authorOf({ role: "toolResult" }), null);
  assert.equal(authorOf({ role: "custom", customType: "memory-recall" }), null);
  assert.equal(authorOf({ role: "custom", customType: "agent-event" }), "system");
  assert.equal(authorOf({ role: "custom", customType: "compaction" }), "system");
});

test("a group opens on author change, on a break, past the gap, or without a timestamp", () => {
  const groups = createGroupTracker();
  const t0 = Date.UTC(2026, 9, 9, 12);
  assert.equal(groups.open("user", t0), true);
  assert.equal(groups.open("user", t0 + 60_000), false);
  assert.equal(groups.open("agent", t0 + 61_000), true);
  assert.equal(groups.open("agent", t0 + 61_000 + GROUP_GAP_MS - 1), false);
  assert.equal(groups.open("agent", t0 + 61_000 + 2 * GROUP_GAP_MS), true, "gap reached");
  assert.equal(groups.open("agent", t0 + 61_000 + 2 * GROUP_GAP_MS + 1, true), true, "day separator or unread divider");
  assert.equal(groups.open("agent", undefined), true, "missing timestamp never merges");
  assert.equal(groups.open("system", t0), false, "system lines never get a header");
  assert.equal(groups.last(), "system");
  assert.equal(groups.open("agent", t0 + 1), true, "a system line breaks the group");
});

test("presence follows the rail priority, paused and quiet hours after the states", () => {
  const base = { state: "idle", paused: false, globalPaused: false, quietHours: false };
  assert.deepEqual(presenceOf({ ...base, state: "needs_input", paused: true }), { key: "needsInput", tone: "orange" });
  assert.deepEqual(presenceOf({ ...base, state: "running" }), { key: "working", tone: "cyan" });
  assert.deepEqual(presenceOf({ ...base, state: "failed" }), { key: "failed", tone: "red" });
  assert.deepEqual(presenceOf({ ...base, globalPaused: true }), { key: "paused", tone: "dim" });
  assert.deepEqual(presenceOf({ ...base, paused: true, quietHours: true }), { key: "paused", tone: "dim" });
  assert.deepEqual(presenceOf({ ...base, quietHours: true }), { key: "quietHours", tone: "dim" });
  assert.deepEqual(presenceOf(base), { key: "available", tone: "dim" });
});

test("list time: today clock, yesterday word, weekday under 7 days, short date after, year outside this year", () => {
  const now = new Date(2026, 9, 9, 15, 0);
  assert.equal(formatListTime(new Date(2026, 9, 9, 14, 5).toISOString(), "fr", now), "14:05");
  assert.equal(formatListTime(new Date(2026, 9, 8, 23, 59).toISOString(), "fr", now), "hier");
  const sixDays = new Date(2026, 9, 3, 10);
  assert.equal(formatListTime(sixDays.toISOString(), "fr", now), sixDays.toLocaleDateString("fr", { weekday: "short" }));
  const eightDays = new Date(2026, 9, 1, 10);
  assert.equal(formatListTime(eightDays.toISOString(), "fr", now), eightDays.toLocaleDateString("fr", { day: "numeric", month: "short" }));
  const lastYear = new Date(2025, 11, 31, 10);
  assert.equal(formatListTime(lastYear.toISOString(), "fr", now), lastYear.toLocaleDateString("fr", { day: "numeric", month: "short", year: "numeric" }));
  assert.equal(formatListTime("not a date", "fr", now), "");
});

test("prefs: details only on for 'on'; rail follows the stored value, else the viewport", () => {
  assert.equal(readDetails("on"), true);
  assert.equal(readDetails("off"), false);
  assert.equal(readDetails(null), false);
  assert.equal(readDetails("garbage"), false);
  assert.equal(readRailExpanded("on", 800), true);
  assert.equal(readRailExpanded("off", 1920), false);
  assert.equal(readRailExpanded(null, 1280), true);
  assert.equal(readRailExpanded("garbage", 1279), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/conversation-helpers.test.mjs`
Expected: FAIL (cannot find `./author-groups.ts`).

- [ ] **Step 3: Write minimal implementation**

`components/agents/conversation/author-groups.ts`:
```ts
import { AGENT_EVENT_UI_TYPE } from "../../../lib/agents/events";
import { RECALL_UI_TYPE } from "../../../lib/agents/recall-card";

export type Author = "agent" | "user" | "system";

/** Two items of the same author further apart than this start a new group (Slack's rule of thumb). */
export const GROUP_GAP_MS = 5 * 60_000;

/** Who "speaks" a top-level thread item; null = not part of the conversation flow (no header, no break). */
export function authorOf(message: { role: string; customType?: string }, options: { eventPrompt?: boolean } = {}): Author | null {
  if (message.role === "user") return options.eventPrompt ? "system" : "user";
  if (message.role === "bashExecution") return "user";
  if (message.role === "assistant") return "agent";
  if (message.role === "toolResult") return null;
  if (message.role === "custom" && message.customType === RECALL_UI_TYPE) return null;
  if (message.role === "custom" && message.customType === AGENT_EVENT_UI_TYPE) return "system";
  return "system";
}

/** Fed in render order; open() answers whether this item gets a group header. */
export function createGroupTracker(gapMs = GROUP_GAP_MS) {
  let previous: { author: Author; at?: number } | null = null;
  return {
    open(author: Author, at: number | undefined, breaks = false): boolean {
      const before = previous;
      previous = { author, at };
      if (author === "system") return false;
      if (breaks || !before || before.author !== author) return true;
      if (at === undefined || before.at === undefined) return true;
      return at - before.at >= gapMs;
    },
    last(): Author | null {
      return previous?.author ?? null;
    },
  };
}
```

`components/agents/conversation/presence.ts`:
```ts
import type { AgentState } from "../../../lib/agents/agent-view";

export type PresenceKey = "needsInput" | "working" | "failed" | "paused" | "quietHours" | "available";
export interface Presence { key: PresenceKey; tone: "orange" | "cyan" | "red" | "dim" }

/** Conversation header status: the rail's state order first, then pause, then quiet hours. */
export function presenceOf(input: { state: AgentState; paused: boolean; globalPaused: boolean; quietHours: boolean }): Presence {
  if (input.state === "needs_input") return { key: "needsInput", tone: "orange" };
  if (input.state === "running") return { key: "working", tone: "cyan" };
  if (input.state === "failed") return { key: "failed", tone: "red" };
  if (input.paused || input.globalPaused) return { key: "paused", tone: "dim" };
  if (input.quietHours) return { key: "quietHours", tone: "dim" };
  return { key: "available", tone: "dim" };
}
```

`components/agents/conversation/list-time.ts`:
```ts
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Conversation list time: local calendar days, as lib/day-separators.ts. Math.round absorbs 23/25 h DST days. */
export function formatListTime(iso: string, locale: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
  if (days < 7) return date.toLocaleDateString(locale, { weekday: "short" });
  return date.toLocaleDateString(locale, date.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}
```

`components/agents/conversation/prefs.ts`:
```ts
export const DETAILS_KEY = "pi-agent-details";
export const RAIL_EXPANDED_KEY = "pi-agent-rail-expanded";
/** Below this viewport width the list would squeeze the thread, so a first visit starts collapsed. */
const RAIL_EXPANDED_MIN_WIDTH = 1280;

export const readDetails = (raw: string | null): boolean => raw === "on";
export const readRailExpanded = (raw: string | null, viewportWidth: number): boolean =>
  raw === "on" ? true : raw === "off" ? false : viewportWidth >= RAIL_EXPANDED_MIN_WIDTH;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadDetails(): boolean {
  if (typeof window === "undefined") return false;
  return readDetails(readStored(DETAILS_KEY));
}

export function loadRailExpanded(): boolean {
  if (typeof window === "undefined") return false;
  return readRailExpanded(readStored(RAIL_EXPANDED_KEY), window.innerWidth);
}

export function savePref(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "on" : "off");
  } catch {
    // Private mode or a full quota: the choice lasts for this page only.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/conversation-helpers.test.mjs`
Expected: PASS (5 tests). Then `node_modules/.bin/tsc --noEmit` and `npm run lint`: clean.

- [ ] **Step 5: Commit**

```bash
git add components/agents/conversation/author-groups.ts components/agents/conversation/presence.ts components/agents/conversation/list-time.ts components/agents/conversation/prefs.ts components/agents/conversation/conversation-helpers.test.mjs
git commit -m "feat(agents): conversation view helpers for author groups, presence, list time and prefs"
```

---

### Task 2: `MessageView` conversation mode

**Files:**
- Modify: `components/MessageView.tsx` (Props ~200-240, `MessageView` ~321-378, `UserMessageView` ~381-520+, `AssistantMessageView` ~693-1080)
- Test: `components/agents/conversation/message-view-conversation.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `MessageView` prop `conversation?: boolean` (default false). DOM contract used by Tasks 3 and 6, only when `conversation` is true:
  - user root: `data-message-role="user"`;
  - assistant root keeps `data-message-role="assistant"`;
  - each assistant block is wrapped in `<div data-block="text|thinking|toolCall" data-tool="<toolName>">` (`data-tool` only for tool calls);
  - no model label row, no cyan left border, `marginBottom: 4`;
  - model name and usage only while `actionsVisible`.

- [ ] **Step 1: Write the failing test**

`components/agents/conversation/message-view-conversation.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const view = await readFile(new URL("../../MessageView.tsx", import.meta.url), "utf8");

test("MessageView takes a boolean conversation prop and compares it in memo", () => {
  assert.match(view, /conversation\?: boolean;/);
  assert.match(view, /&& prev\.conversation === next\.conversation/);
});

test("conversation mode tags assistant blocks for the CSS and drops the model label row", () => {
  assert.match(view, /data-block=\{block\.type\}/);
  assert.match(view, /data-tool=\{block\.type === "toolCall" \? \(block as ToolCallContent\)\.toolName : undefined\}/);
  assert.match(view, /\{!conversation && \(\s*\{\/\* Model label \*\/\}/);
});

test("conversation mode renders the user message left-aligned without the chamfered bubble", () => {
  assert.match(view, /data-message-role=\{conversation \? "user" : undefined\}/);
  assert.match(view, /alignItems: conversation \? "stretch" : "flex-end"/);
  assert.match(view, /const Bubble = conversation \? PlainBubble : Chamfer;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/message-view-conversation.test.mjs`
Expected: FAIL (no `conversation?: boolean;`).

- [ ] **Step 3: Implement**

1. In `Props` (the interface whose fields start at ~200), after `runActive`, add:
```ts
  /** Agent view only: plain left-aligned layout, blocks tagged with data-block/data-tool for agent-conversation.css. */
  conversation?: boolean;
```
2. In the `MessageView` destructuring add `conversation = false`. Pass `conversation={conversation}` to `UserMessageView` and `AssistantMessageView`. In the memo comparator add `&& prev.conversation === next.conversation` as the last line before `;`.
3. `UserMessageView`: add `conversation?: boolean` to its props type and destructuring. Above the function add:
```tsx
/** Conversation mode stand-in for Chamfer: same props, no clipped bubble, no background unless editing. */
function PlainBubble({ className, innerClassName, innerStyle, children }: { tone?: string; glow?: boolean; cut?: number; className?: string; innerClassName?: string; innerStyle?: CSSProperties; children?: ReactNode }) {
  const { padding: _padding, background, ...rest } = innerStyle ?? {};
  return (
    <div className={className}>
      <div className={innerClassName} style={{ ...rest, padding: 0, background: background === "var(--user-bg)" ? "transparent" : background }}>{children}</div>
    </div>
  );
}
```
(Import `CSSProperties` / `ReactNode` from `react` if not already imported. If lint flags `_padding`, use `const { padding, background, ...rest } = …; void padding;`.)
In `UserMessageView`, right before `return (` of the non-event-prompt branch, add `const Bubble = conversation ? PlainBubble : Chamfer;`. Replace the `<Chamfer` / `</Chamfer>` tags of the bubble with `<Bubble` / `</Bubble>`. On the root `<div style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "flex-end" }}`, change it to:
```tsx
    <div
      data-message-role={conversation ? "user" : undefined}
      style={{ marginBottom: conversation ? 4 : 16, display: "flex", flexDirection: "column", alignItems: conversation ? "stretch" : "flex-end" }}
```
In the inner row `style={{ display: "flex", alignItems: "flex-end", gap: 6, maxWidth: "85%" }}`, use `maxWidth: conversation ? "100%" : "85%"`. Leave the hover actions, edit, fork and command expansion untouched.
4. `AssistantMessageView`: add `conversation?: boolean` to its props type and destructuring.
   - Wrap the whole `{/* Model label */}` `<div …>…</div>` block as `{!conversation && (` + newline + `{/* Model label */}` … `)}` so that the comment stays the first token inside the parenthesis (the test matches that).
   - Root `style={{ marginBottom: 16 }}` → `style={{ marginBottom: conversation ? 4 : 16 }}`.
   - The block container `<div className="border-l border-tron-cyan pl-3.5 shadow-[-6px_0_10px_-8px_var(--color-tron-cyan)]" …>` → `className={conversation ? undefined : "border-l border-tron-cyan pl-3.5 shadow-[-6px_0_10px_-8px_var(--color-tron-cyan)]"}`.
   - Replace the `blockItems.map(...)` body with:
```tsx
        {blockItems.map(({ block, originalIndex }) => {
          const view = <BlockView key={`${entryId ?? "stream"}-${originalIndex}`} block={block} searchTarget={block === searchBlock} toolResults={toolResults} isStreaming={isStreaming} streamingDuration={streamingDurations.get(originalIndex) ?? (block.type === "thinking" ? thinkingDurationFromFile : undefined)} toolCallDurations={toolCallDurations} cwd={cwd} onOpenFile={onOpenFile} onOpenSession={onOpenSession} plannotator={plannotator} sessionId={sessionId} entryId={entryId} blockIndex={originalIndex} runningToolIds={runningToolIds} runActive={runActive} />;
          return conversation ? (
            <div key={`${entryId ?? "stream"}-${originalIndex}`} data-block={block.type} data-tool={block.type === "toolCall" ? (block as ToolCallContent).toolName : undefined}>{view}</div>
          ) : view;
        })}
```
   - In the footer row, the usage line `{message.usage && !isStreaming && (` becomes `{message.usage && !isStreaming && (!conversation || actionsVisible) && (`, and right before it insert:
```tsx
        {conversation && actionsVisible && !isStreaming && message.provider && (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{getModelDisplayName(message.provider, message.model, modelNames)}</div>
        )}
```

- [ ] **Step 4: Run tests and gates**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/message-view-conversation.test.mjs components/*.test.mjs`
Expected: new test PASS; existing component tests unchanged. Then `node_modules/.bin/tsc --noEmit` and `npm run lint`: clean.

- [ ] **Step 5: Commit**

```bash
git add components/MessageView.tsx components/agents/conversation/message-view-conversation.test.mjs
git commit -m "feat(agents): MessageView conversation mode, plain layout and tagged blocks"
```

---

### Task 3: Conversation stylesheet

**Files:**
- Create: `app/agent-conversation.css`
- Modify: `app/layout.tsx` (import after `./sidebar-tron.css`)
- Test: `components/agents/conversation/conversation-css.test.mjs`

**Interfaces:**
- Consumes: DOM contract of Task 2; class names produced by Tasks 4-7: `.conv-group-header`, `.conv-gutter`, `.conv-user-avatar`, `.conv-name`, `.conv-time`, `.conv-item[data-author][data-time]`, `[data-process]`, `.conv-working`, `.conv-header*`, `.agent-event-line`, `.agent-rail-expanded`, `.agent-row*`, `.conv-dialog-speaker`.
- Produces: the stylesheet (all rules scoped under `[data-chat-style="agent"]`, `.conv-header`, `.conv-dialog-speaker` or `.agent-rail-expanded`).

- [ ] **Step 1: Write the failing test**

`components/agents/conversation/conversation-css.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const css = await read("../../../app/agent-conversation.css");
const layout = await read("../../../app/layout.tsx");
const OFF_PALETTE = /#(?!(?:000|000000|fff|ffffff)\b)[0-9a-f]{3,8}\b|rgba?\(\s*(?!0[\s,]+0[\s,]+0\b|0 216 255\b|255 154 0\b|255 77 94\b)\d/i;
const SPEECH = '[data-tool="agent_notify"], [data-tool="agent_approve"], [data-tool="agent_delegate"]';

test("the sheet loads after the Tron sidebar sheet", () => {
  assert.match(layout, /import "\.\/sidebar-tron\.css";\nimport "\.\/agent-conversation\.css";/);
});

test("no off-palette colour literal", () => {
  assert.equal(css.replace(/\/\*[\s\S]*?\*\//g, "").match(OFF_PALETTE), null);
});

test("details off hides thinking and non-speech tool calls, and messages left with nothing to show", () => {
  assert.ok(css.includes('[data-agent-details="off"] [data-block="thinking"]'));
  assert.ok(css.includes(`[data-agent-details="off"] [data-block="toolCall"]:not(${SPEECH})`));
  assert.ok(css.includes(`[data-agent-details="off"] [data-message-role="assistant"]:not(:has([data-block="text"], ${SPEECH}, [role="alert"]))`));
  assert.ok(css.includes(`[data-agent-details="off"] [data-process] [data-message-role="assistant"]:not(:has(${SPEECH}, [role="alert"]))`));
  assert.ok(css.includes('[data-agent-details="off"] [data-process] [data-block="text"]'));
});

test("readability: 72ch prose, 15px body, 1.6 line height, no HUD font in the thread", () => {
  assert.match(css, /max-width: 72ch/);
  assert.match(css, /--chat-font-size-offset: calc\(var\(--chat-content-font-size, 14px\) - 13px\)/);
  assert.match(css, /line-height: 1\.6/);
  assert.doesNotMatch(css, /font-hud|orbitron/i);
});

test("reduced motion stops the working pulse", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.conv-working[\s\S]*animation: none/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/conversation-css.test.mjs`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement**

`app/layout.tsx`: add `import "./agent-conversation.css";` on the line right after `import "./sidebar-tron.css";`.

`app/agent-conversation.css`:
```css
/* Agent conversation view (docs/superpowers/specs/2026-10-09-agent-conversation-design.md).
   Every rule is scoped: ordinary sessions never match. */

/* ---- Measure and rhythm ---- */
[data-chat-style="agent"] {
  /* +1 px over the user's chat font size: 15 px by default. */
  --chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 13px);
}
[data-chat-style="agent"] .markdown-body { line-height: 1.6; }
[data-chat-style="agent"] .markdown-body p { margin-bottom: 0.75em; }
[data-chat-style="agent"] .markdown-body > :is(p, ul, ol, blockquote, h1, h2, h3, h4, h5, h6),
[data-chat-style="agent"] [data-message-role="user"] { max-width: 72ch; }
[data-chat-style="agent"] .markdown-body a { text-decoration: underline; text-underline-offset: 2px; }

/* ---- Gutter, groups, headers ---- */
[data-chat-style="agent"] .conv-item { position: relative; padding-left: 40px; }
[data-chat-style="agent"] .conv-item[data-author="user"]::after {
  content: ""; position: absolute; left: 13px; top: 2px; bottom: 2px; width: 2px; background: var(--color-tron-orange);
}
[data-chat-style="agent"] .conv-item[data-time]:is(:hover, :focus-within)::before {
  content: attr(data-time); position: absolute; left: 0; top: 4px; width: 36px;
  font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums;
}
@media (pointer: coarse) {
  [data-chat-style="agent"] .conv-item[data-time]::before { content: none; }
}
.conv-group-header { display: flex; align-items: baseline; gap: 8px; margin: 20px 0 4px; min-width: 0; }
.conv-group-header .conv-gutter { width: 32px; flex-shrink: 0; align-self: center; display: inline-flex; justify-content: center; }
.conv-name { font-family: var(--font-ui); font-weight: 600; font-size: 15px; color: var(--text); }
.conv-time { font-size: 12px; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.conv-user-avatar {
  display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border: 1px solid var(--color-tron-orange); color: var(--color-tron-orange); font-size: 13px; font-weight: 600;
}

/* ---- Details off: tool calls and reasoning hidden, the agent's speech acts kept ---- */
[data-agent-details="off"] [data-block="thinking"],
[data-agent-details="off"] [data-block="toolCall"]:not([data-tool="agent_notify"], [data-tool="agent_approve"], [data-tool="agent_delegate"]) { display: none; }
[data-agent-details="off"] [data-message-role="assistant"]:not(:has([data-block="text"], [data-tool="agent_notify"], [data-tool="agent_approve"], [data-tool="agent_delegate"], [role="alert"])) { display: none; }
/* Inside a finished turn's process, the narration is noise too: only speech acts stay. */
[data-agent-details="off"] [data-process] [data-block="text"] { display: none; }
[data-agent-details="off"] [data-process] [data-message-role="assistant"]:not(:has([data-tool="agent_notify"], [data-tool="agent_approve"], [data-tool="agent_delegate"], [role="alert"])) { display: none; }

/* Speech acts read as the agent talking, not as a tool card. */
[data-chat-style="agent"] .agent-notify {
  border: none; border-left: 2px solid var(--color-tron-orange); padding: 2px 0 2px 10px; margin: 2px 0;
  font-size: inherit; line-height: 1.6;
}

/* ---- System lines (events): event cards only exist in agent threads, so these are not scoped ---- */
.agent-event-line {
  display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin: 12px 0;
  padding: 2px 0; border: none; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--text-muted); text-align: center;
}
.agent-event-line::before,
.agent-event-line::after { content: ""; flex: 1 1 24px; max-width: 120px; height: 1px; background: var(--border); }
.agent-event-line[data-failed] { color: var(--color-tron-red); }
.agent-event-line:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
.agent-event-line-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- Working line ---- */
.conv-working { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 13px; color: var(--text-muted); }
.conv-working .conv-gutter { width: 32px; display: inline-flex; justify-content: center; }
.conv-working-text { animation: pulse 1.5s infinite; }
@media (prefers-reduced-motion: reduce) {
  .conv-working, .conv-working-text { animation: none; }
}

/* ---- Conversation header ---- */
.conv-header {
  position: relative; z-index: 2; display: flex; align-items: center; gap: 10px; min-width: 0;
  padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg);
}
.conv-header-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.conv-header-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.conv-header-name { font-family: var(--font-ui); font-weight: 600; font-size: 15px; color: var(--text); }
.conv-header-status { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); white-space: nowrap; }
.conv-header-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); flex-shrink: 0; }
.conv-header-status[data-tone="orange"] { color: var(--color-tron-orange); }
.conv-header-status[data-tone="orange"] .conv-header-dot { background: var(--color-tron-orange); }
.conv-header-status[data-tone="cyan"] .conv-header-dot { background: var(--color-tron-cyan); }
.conv-header-status[data-tone="red"] { color: var(--color-tron-red); }
.conv-header-status[data-tone="red"] .conv-header-dot { background: var(--color-tron-red); }
.conv-header-role { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-header-details { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; color: var(--text-muted); cursor: pointer; flex-shrink: 0; }
@media (pointer: coarse) { .conv-header-details { min-height: 44px; } }
@media (max-width: 400px) { .conv-header-role { display: none; } }

/* ---- Approval / extension dialog speaker ---- */
.conv-dialog-speaker { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; color: var(--text-muted); }

/* ---- Expanded rail (conversation list) ---- */
.agent-rail.agent-rail-expanded { width: 240px; align-items: stretch; padding: 8px; gap: 2px; }
.agent-rail-expanded .agent-row {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 6px 8px;
  border: none; background: transparent; color: var(--text); text-align: left; cursor: pointer;
}
.agent-rail-expanded .agent-row:hover { background: var(--bg-hover); }
.agent-rail-expanded .agent-row[aria-current="true"] { background: var(--bg-selected); }
.agent-rail-expanded .agent-row:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; }
.agent-row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.agent-row-line1 { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.agent-row-name { font-family: var(--font-ui); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-row[data-unread] .agent-row-name { font-weight: 700; }
.agent-row-unread { font-family: var(--font-mono); font-size: 11px; color: var(--color-tron-cyan); }
.agent-row-time { margin-left: auto; font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.agent-row-preview { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-row-preview[data-state="needs_input"] { color: var(--color-tron-orange); }
.agent-row-preview[data-state="failed"] { color: var(--color-tron-red); }
.agent-rail-expanded .agent-rail-action { width: 100%; justify-content: flex-start; gap: 8px; padding: 0 8px; }
```

- [ ] **Step 4: Run test and gates**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/conversation-css.test.mjs components/sidebar-tron.test.mjs`
Expected: PASS. `npm run lint`: clean.

- [ ] **Step 5: Commit**

```bash
git add app/agent-conversation.css app/layout.tsx components/agents/conversation/conversation-css.test.mjs
git commit -m "feat(agents): conversation view stylesheet, readability rules and hidden tool calls"
```

---

### Task 4: `GroupHeader` and `ConversationHeader` components + i18n

**Files:**
- Create: `components/agents/conversation/GroupHeader.tsx`
- Create: `components/agents/conversation/ConversationHeader.tsx`
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (next to the other `agents.*` keys, ~1554)
- Test: `components/agents/conversation/conversation-components.test.mjs`

**Interfaces:**
- Consumes: `presenceOf`, `PresenceKey` (Task 1); `AgentAvatar` (`components/agents/AgentAvatar.tsx`, props `avatar`, `size`); `Switch` (`components/ui/switch.tsx`, Radix: `checked`, `onCheckedChange`, `id`); `formatRelativeTime(date, locale)` from `@/lib/i18n/format`; `AgentListItem` from `@/lib/agents/agent-view`.
- Produces:
  - `formatClock(timestamp: number, locale: string): string`
  - `GroupHeader({ author, agent, timestamp }: { author: "agent" | "user"; agent?: { name: string; avatar: AgentListItem["avatar"] }; timestamp?: number })`
  - `ConversationHeader({ agent, role, globalPaused, quietHours, details, onDetailsChange }: { agent: AgentListItem; role?: string; globalPaused: boolean; quietHours: boolean; details: boolean; onDetailsChange: (next: boolean) => void })`
  - i18n keys: `agents.chat.you`, `agents.chat.youInitial`, `agents.chat.working`, `agents.chat.details`, `agents.chat.detailsHint`, `agents.chat.asks`, `agents.presence.{needsInput,working,failed,paused,quietHours,available,availableSince}`, `agents.rail.expand`, `agents.rail.collapse`.

- [ ] **Step 1: Write the failing test**

`components/agents/conversation/conversation-components.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const groupHeader = await read("./GroupHeader.tsx");
const header = await read("./ConversationHeader.tsx");
const KEYS = ["agents.chat.you", "agents.chat.youInitial", "agents.chat.working", "agents.chat.details", "agents.chat.detailsHint", "agents.chat.asks",
  "agents.presence.needsInput", "agents.presence.working", "agents.presence.failed", "agents.presence.paused", "agents.presence.quietHours",
  "agents.presence.available", "agents.presence.availableSince", "agents.rail.expand", "agents.rail.collapse"];

test("every new key exists in the four locales", async () => {
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await read(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of KEYS) assert.ok(messages.includes(`"${key}":`), `${locale}: ${key}`);
  }
});

test("the group header shows a name and a machine-readable time, the avatar is decorative", () => {
  assert.match(groupHeader, /<time className="conv-time" dateTime=/);
  assert.match(groupHeader, /className="conv-gutter" aria-hidden="true"/);
  assert.match(groupHeader, /t\("agents\.chat\.you"\)/);
});

test("the header states presence in words next to the dot and labels the details switch", () => {
  assert.match(header, /presenceOf\(/);
  assert.match(header, /data-tone=\{presence\.tone\}/);
  assert.match(header, /t\(`agents\.presence\.\$\{presence\.key\}`\)/);
  assert.match(header, /<Switch id=\{switchId\} checked=\{details\} onCheckedChange=\{onDetailsChange\}/);
  assert.match(header, /<label htmlFor=\{switchId\} className="conv-header-details"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/conversation-components.test.mjs`
Expected: FAIL (files missing).

- [ ] **Step 3: Implement**

`components/agents/conversation/GroupHeader.tsx`:
```tsx
"use client";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { AgentAvatar } from "../AgentAvatar";

export const formatClock = (timestamp: number, locale: string): string =>
  new Date(timestamp).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

/** Avatar, name and time opening a run of messages by the same author. */
export function GroupHeader({ author, agent, timestamp }: { author: "agent" | "user"; agent?: { name: string; avatar: AgentListItem["avatar"] }; timestamp?: number }) {
  const { t, locale } = useI18n();
  return (
    <div className="conv-group-header" data-author={author}>
      <span className="conv-gutter" aria-hidden="true">
        {author === "agent" && agent ? <AgentAvatar avatar={agent.avatar} size={28} /> : <span className="conv-user-avatar">{t("agents.chat.youInitial")}</span>}
      </span>
      <span className="conv-name">{author === "agent" ? agent?.name : t("agents.chat.you")}</span>
      {timestamp !== undefined && <time className="conv-time" dateTime={new Date(timestamp).toISOString()}>{formatClock(timestamp, locale)}</time>}
    </div>
  );
}
```

`components/agents/conversation/ConversationHeader.tsx`:
```tsx
"use client";
import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { formatRelativeTime } from "@/lib/i18n/format";
import { AgentAvatar } from "../AgentAvatar";
import { presenceOf } from "./presence";

/** Who you are talking to and what they are doing; every input is already loaded by AppShell. */
export function ConversationHeader({ agent, role, globalPaused, quietHours, details, onDetailsChange }: { agent: AgentListItem; role?: string; globalPaused: boolean; quietHours: boolean; details: boolean; onDetailsChange: (next: boolean) => void }) {
  const { t, locale } = useI18n();
  const switchId = useId();
  const presence = presenceOf({ state: agent.state, paused: agent.paused, globalPaused, quietHours });
  const status = presence.key === "available" && agent.lastActivityAt
    ? t("agents.presence.availableSince", { time: formatRelativeTime(agent.lastActivityAt, locale) })
    : t(`agents.presence.${presence.key}`);
  const roleLine = role?.split("\n").map((line) => line.trim()).find(Boolean);
  return (
    <header className="conv-header">
      <AgentAvatar avatar={agent.avatar} size={28} />
      <div className="conv-header-text">
        <div className="conv-header-line">
          <span className="conv-header-name">{agent.name}</span>
          <span className="conv-header-status" data-tone={presence.tone} role="status">
            <span className="conv-header-dot" aria-hidden="true" />
            {status}
          </span>
        </div>
        {roleLine && <span className="conv-header-role" title={roleLine}>{roleLine}</span>}
      </div>
      <label htmlFor={switchId} className="conv-header-details" title={t("agents.chat.detailsHint")}>
        {t("agents.chat.details")}
        <Switch id={switchId} checked={details} onCheckedChange={onDetailsChange} aria-describedby={undefined} />
      </label>
    </header>
  );
}
```
(If `formatRelativeTime`'s `Locale` type rejects the `locale` from `useI18n()`, use the same cast `AgentRail.tsx` uses; it passes `locale` directly.)

i18n, same block in each file next to `"agents.rail.new"`:
- en: `"agents.chat.you": "You"`, `"agents.chat.youInitial": "Y"`, `"agents.chat.working": "{name} is working…"`, `"agents.chat.details": "Details"`, `"agents.chat.detailsHint": "Show tool calls and reasoning"`, `"agents.chat.asks": "{name} asks you"`, `"agents.presence.needsInput": "waiting for your answer"`, `"agents.presence.working": "working…"`, `"agents.presence.failed": "last webhook failed"`, `"agents.presence.paused": "paused"`, `"agents.presence.quietHours": "quiet hours"`, `"agents.presence.available": "available"`, `"agents.presence.availableSince": "available · active {time}"`, `"agents.rail.expand": "Expand the agent list"`, `"agents.rail.collapse": "Collapse the agent list"`
- fr: `"Toi"`, `"T"`, `"{name} travaille…"`, `"Détails"`, `"Afficher les appels d'outils et le raisonnement"`, `"{name} te demande"`, `"attend ta réponse"`, `"travaille…"`, `"dernier webhook en échec"`, `"en pause"`, `"heures calmes"`, `"disponible"`, `"disponible · actif {time}"`, `"Déplier la liste des agents"`, `"Replier la liste des agents"`
- zh-CN: `"你"`, `"你"`, `"{name} 正在工作…"`, `"详情"`, `"显示工具调用和推理"`, `"{name} 向你提问"`, `"等待你的回复"`, `"工作中…"`, `"上次 webhook 失败"`, `"已暂停"`, `"免打扰时段"`, `"空闲"`, `"空闲 · {time}活跃"`, `"展开智能体列表"`, `"收起智能体列表"`
- zh-TW: `"你"`, `"你"`, `"{name} 正在工作…"`, `"詳情"`, `"顯示工具呼叫和推理"`, `"{name} 向你提問"`, `"等待你的回覆"`, `"工作中…"`, `"上次 webhook 失敗"`, `"已暫停"`, `"勿擾時段"`, `"空閒"`, `"空閒 · {time}活躍"`, `"展開智慧代理列表"`, `"收合智慧代理列表"`

- [ ] **Step 4: Run test and gates**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/conversation-components.test.mjs lib/i18n/*.test.mjs`
Expected: PASS (an i18n parity test, if present, stays green). `node_modules/.bin/tsc --noEmit`, `npm run lint`: clean.

- [ ] **Step 5: Commit**

```bash
git add components/agents/conversation/GroupHeader.tsx components/agents/conversation/ConversationHeader.tsx components/agents/conversation/conversation-components.test.mjs lib/i18n/messages/en.ts lib/i18n/messages/fr.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts
git commit -m "feat(agents): conversation group header and presence header"
```

---

### Task 5: Event cards as system lines

**Files:**
- Modify: `components/agents/AgentEventCard.tsx`
- Test: `components/agents/AgentEventCard.test.mjs` (extend)

**Interfaces:**
- Consumes: `.agent-event-line` styles (Task 3); existing `i18n.collapse` key.
- Produces: schedule / task / webhook cards render folded as `<button className="agent-event-line" aria-expanded={false}>`. A click opens today's card, which then has a collapse button. Delegation results stay open (they are content another agent wrote for you).

- [ ] **Step 1: Write the failing test** (append to `components/agents/AgentEventCard.test.mjs`; reuse its existing `readFile` import, or add one)

```js
test("schedule, task and webhook events fold to a system line; delegation results stay open", async () => {
  const { readFile } = await import("node:fs/promises");
  const card = await readFile(new URL("./AgentEventCard.tsx", import.meta.url), "utf8");
  assert.match(card, /const \[open, setOpen\] = useState\(false\);/);
  assert.match(card, /className="agent-event-line"/);
  assert.match(card, /data-failed=\{failed \|\| undefined\}/);
  assert.match(card, /aria-expanded=\{false\}/);
  assert.match(card, /t\("i18n\.collapse"\)/);
  const delegation = card.indexOf('data.kind === "delegation"');
  const line = card.indexOf('className="agent-event-line"');
  assert.ok(delegation >= 0 && line > delegation, "the delegation branch returns before the folded line");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/AgentEventCard.test.mjs`
Expected: FAIL on the new test.

- [ ] **Step 3: Implement**

In `AgentEventCard`, next to the other `useState` calls (hooks must stay above the early `return null`), add `const [open, setOpen] = useState(false);`. After the `if (data.kind === "delegation") { … }` block and after `icon` / `label` are computed, insert:
```tsx
  const failed = webhook && data.status === "failed";
  if (!open) {
    return (
      <button type="button" className="agent-event-line" data-failed={failed || undefined} aria-expanded={false} onClick={() => setOpen(true)}>
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
        <span aria-hidden>·</span>
        <span className="agent-event-line-title">{data.title}</span>
        {failed && <><span aria-hidden>·</span><span>{t("agents.event.failed")}</span></>}
      </button>
    );
  }
```
In the existing full-card JSX (the `<div className={webhook ? … } role="note">`), add as the last child:
```tsx
      <button type="button" className="agent-event-toggle" aria-expanded={true} onClick={() => setOpen(false)}>{t("i18n.collapse")}</button>
```
Reuse `failed` in place of the existing `webhook && data.status === "failed"` expressions where they appear in that JSX.

- [ ] **Step 4: Run test and gates**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/AgentEventCard.test.mjs`
Expected: PASS. If an older assertion in that file expected the head to render unconditionally, update it to the folded/open split and say so in the commit body. `tsc`, `lint`: clean.

- [ ] **Step 5: Commit**

```bash
git add components/agents/AgentEventCard.tsx components/agents/AgentEventCard.test.mjs
git commit -m "feat(agents): fold schedule, task and webhook cards into system lines"
```

---

### Task 6: `ChatWindow` and `AppShell` integration

**Files:**
- Modify: `components/ChatWindow.tsx` (Props ~17-90; body near `trustedAgentName` ~489; header insertion before `<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">` ~1212; scroll container ~1221; render loop ~1232-1475; working line ~1490; `ExtensionDialog` ~1865)
- Modify: `components/AppShell.tsx` (`<ChatWindow` props ~2585)
- Test: `components/agents/conversation/chat-window-conversation.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-5. `createGroupTracker`, `authorOf`, `loadDetails`, `savePref`, `DETAILS_KEY`, `GroupHeader`, `formatClock`, `ConversationHeader`, `MessageView` prop `conversation`, CSS classes.
- Produces: `ChatWindow` prop `agentConversation?: { agent: AgentListItem; role?: string; globalPaused: boolean; quietHours: boolean }`.

- [ ] **Step 1: Write the failing test**

`components/agents/conversation/chat-window-conversation.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const chat = await read("../../ChatWindow.tsx");
const shell = await read("../../AppShell.tsx");

test("conversation mode only for a trusted agent thread with agent data", () => {
  assert.match(chat, /const conversation = Boolean\(trustedAgentName && agentConversation\);/);
  assert.match(chat, /data-chat-style=\{conversation \? "agent" : undefined\}/);
  assert.match(chat, /data-agent-details=\{conversation \? \(details \? "on" : "off"\) : undefined\}/);
  assert.match(chat, /conversation=\{conversation\}/);
});

test("details: persisted, and a revealed process keeps today's group", () => {
  assert.match(chat, /useState\(loadDetails\)/);
  assert.match(chat, /savePref\(DETAILS_KEY, next\)/);
  assert.match(chat, /if \(conversation && !details && !revealProcess\) \{/);
  assert.match(chat, /hasSpeechAct/);
  assert.match(chat, /data-process/);
});

test("group headers come from one tracker per render; the streaming tail gets one when the agent did not speak last", () => {
  assert.match(chat, /const groups = createGroupTracker\(\);/);
  assert.match(chat, /groups\.open\(author, messageTimestamp, dayLabel !== null \|\| idx === unreadAt\)/);
  assert.match(chat, /groups\.last\(\) !== "agent"/);
});

test("the working line names the agent; the plain phase line stays for ordinary sessions", () => {
  assert.match(chat, /className="conv-working"/);
  assert.match(chat, /t\("agents\.chat\.working", \{ name: agentConversation\.agent\.name \}\)/);
  assert.match(chat, /!conversation && agentRunning && !hasStreamingContent/);
});

test("AppShell passes the active agent, its role, the global pause and quiet hours", () => {
  assert.match(shell, /agentConversation=\{/);
  assert.match(shell, /quietHours: healthState\?\.health\.quietHours \?\? false/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/chat-window-conversation.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

1. **Imports** (top of `ChatWindow.tsx`):
```ts
import type { AgentListItem } from "@/lib/agents/agent-view";
import { AGENT_APPROVE_TOOL, AGENT_DELEGATE_TOOL, AGENT_NOTIFY_TOOL } from "@/lib/agents/events";
import { authorOf, createGroupTracker } from "./agents/conversation/author-groups";
import { DETAILS_KEY, loadDetails, savePref } from "./agents/conversation/prefs";
import { formatClock, GroupHeader } from "./agents/conversation/GroupHeader";
import { ConversationHeader } from "./agents/conversation/ConversationHeader";
import { AgentAvatar } from "./agents/AgentAvatar";
```
(Merge with existing imports of the same modules, e.g. `@/lib/agents/events` if already imported.)

2. **Prop**: in `Props`, add
```ts
  /** Agent view: the agent's list item and the header inputs; turns on the conversation layout. */
  agentConversation?: { agent: AgentListItem; role?: string; globalPaused: boolean; quietHours: boolean };
```
and add `agentConversation` to the destructuring of `ChatWindow(...)`.

3. **State**, right after the `trustedAgentName` line (~489):
```ts
  const conversation = Boolean(trustedAgentName && agentConversation);
  const [details, setDetails] = useState(loadDetails);
  const changeDetails = useCallback((next: boolean) => {
    setDetails(next);
    savePref(DETAILS_KEY, next);
  }, []);
```
And a module-level helper next to `ProcessDetailsGroup`:
```ts
const SPEECH_TOOLS: ReadonlySet<string> = new Set([AGENT_NOTIFY_TOOL, AGENT_APPROVE_TOOL, AGENT_DELEGATE_TOOL]);
/** True when an assistant message holds a call the conversation view keeps visible with details off. */
function hasSpeechAct(message: AgentMessage): boolean {
  return message.role === "assistant" && ((message as AssistantMessage).content ?? []).some((block) => block.type === "toolCall" && SPEECH_TOOLS.has((block as ToolCallContent).toolName));
}
```
(Import `ToolCallContent` from wherever `ChatWindow` already gets `AssistantMessage`; add it to that import.)

4. **Header**: immediately before `<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">` insert:
```tsx
      {conversation && agentConversation && (
        <ConversationHeader agent={agentConversation.agent} role={agentConversation.role} globalPaused={agentConversation.globalPaused} quietHours={agentConversation.quietHours} details={details} onDetailsChange={changeDetails} />
      )}
```

5. **Scroll container**: on the `<div ref={scrollContainerRef} …>` add
```tsx
          data-chat-style={conversation ? "agent" : undefined}
          data-agent-details={conversation ? (details ? "on" : "off") : undefined}
```

6. **Tracker**: just before the component's main `return (` (the one rendering `className="chat-content …"`), add `const groups = createGroupTracker();`. One fresh tracker per render, fed in render order by the loop below.

7. **renderMessage** (inside the IIFE): pass `conversation={conversation}` to the `<MessageView … />`. Then replace the block from `const dayAndNode = dayLabel === null ? node : (` to the end of `renderMessage` with:
```tsx
                const author = conversation && keyPrefix === "message" ? authorOf(msg, { eventPrompt: eventPrompts.has(idx) }) : null;
                let speaker: ReactNode = node;
                if (author) {
                  const opens = groups.open(author, messageTimestamp, dayLabel !== null || idx === unreadAt);
                  if (author !== "system") {
                    speaker = (
                      <Fragment key={`${keyPrefix}-conv-${messageKey}`}>
                        {opens && <GroupHeader author={author} agent={agentConversation?.agent} timestamp={messageTimestamp} />}
                        <div className="conv-item" data-author={author} data-time={!opens && messageTimestamp !== undefined ? formatClock(messageTimestamp, locale) : undefined}>{node}</div>
                      </Fragment>
                    );
                  }
                }
                const dayAndNode = dayLabel === null ? speaker : (
                  <Fragment key={`${keyPrefix}-day-${messageKey}`}>
                    <div className="day-separator" role="separator">{dayLabel}</div>
                    {speaker}
                  </Fragment>
                );
                if (idx === unreadAt && keyPrefix === "message") {
                  return (
                    <Fragment key={`${keyPrefix}-unread-${messageKey}`}>
                      {unreadDivider}
                      {dayAndNode}
                    </Fragment>
                  );
                }
                return dayAndNode;
```
`messageTimestamp` is already declared above in `renderMessage`; keep that declaration.

8. **Process group**: replace the `if (processViews.length > 0) { … }` block with:
```tsx
                if (processViews.length > 0) {
                  const dividerInProcess = unreadAt > userIdx && (unreadAt < finalAssistantIdx || (unreadAt === finalAssistantIdx && !finalAnswerMessage));
                  if (dividerInProcess) rendered.push(unreadDivider);
                  if (conversation && !details && !revealProcess) {
                    // Details off: only the agent's speech acts survive (agent-conversation.css hides the rest).
                    let speaks = false;
                    for (let i = userIdx + 1; i <= finalAssistantIdx && !speaks; i++) speaks = hasSpeechAct(messages[i]);
                    if (speaks) {
                      const processAt = (messages[userIdx + 1] as AgentMessage & { timestamp?: number } | undefined)?.timestamp;
                      const opens = groups.open("agent", processAt, dividerInProcess);
                      rendered.push(
                        <Fragment key={`process-conv-${entryIds[groupStartIdx] ?? groupStartIdx}`}>
                          {opens && <GroupHeader author="agent" agent={agentConversation?.agent} timestamp={processAt} />}
                          <div className="conv-item" data-author="agent" data-process ref={processRefIdx === undefined ? undefined : (el) => { messageRefs.current[processRefIdx] = el; }}>
                            {processViews}
                          </div>
                        </Fragment>,
                      );
                    }
                  } else {
                    if (conversation && groups.open("agent", (messages[userIdx + 1] as AgentMessage & { timestamp?: number } | undefined)?.timestamp, dividerInProcess)) {
                      rendered.push(<GroupHeader key={`process-head-${entryIds[groupStartIdx] ?? groupStartIdx}`} author="agent" agent={agentConversation?.agent} timestamp={(messages[userIdx + 1] as AgentMessage & { timestamp?: number } | undefined)?.timestamp} />);
                    }
                    rendered.push(
                      <div
                        key={`process-group-${entryIds[groupStartIdx] ?? groupStartIdx}`}
                        className={conversation ? "conv-item" : undefined}
                        data-author={conversation ? "agent" : undefined}
                        ref={processRefIdx === undefined ? undefined : (el) => { messageRefs.current[processRefIdx] = el; }}
                      >
                        {/* (keep the existing re-key comment here) */}
                        <ProcessDetailsGroup key={finalAnswerMessage ? "answered" : "unanswered"} messageCount={processViews.length} toolCallCount={processToolCount} defaultExpanded={!finalAnswerMessage} reveal={revealProcess} t={t}>
                          {processViews}
                        </ProcessDetailsGroup>
                      </div>,
                    );
                  }
                }
```
Keep the existing comment about re-keying on answer availability above `<ProcessDetailsGroup`. For ordinary sessions the `else` branch renders exactly today's markup: `className` and `data-author` are `undefined`.

9. **Streaming tail**: replace the `{streamState.isStreaming && hasStreamingContent && streamState.streamingMessage && ( <MessageView … /> )}` expression with:
```tsx
            {streamState.isStreaming && hasStreamingContent && streamState.streamingMessage && (
              conversation ? (
                <>
                  {groups.last() !== "agent" && <GroupHeader author="agent" agent={agentConversation?.agent} />}
                  <div className="conv-item" data-author="agent">
                    <MessageView message={streamState.streamingMessage as AgentMessage} toolResults={toolResultsMap} runningToolIds={runningToolIds} isStreaming modelNames={modelNames} cwd={messageCwd} onOpenFile={onOpenFile} onOpenSession={onOpenSession} plannotator={plannotator} conversation />
                  </div>
                </>
              ) : (
                <MessageView message={streamState.streamingMessage as AgentMessage} toolResults={toolResultsMap} runningToolIds={runningToolIds} isStreaming modelNames={modelNames} cwd={messageCwd} onOpenFile={onOpenFile} onOpenSession={onOpenSession} plannotator={plannotator} />
              )
            )}
```

10. **Working line**: in the visible (non-`aria-live`) `<div>`, change the phase condition to `!conversation && agentRunning && !hasStreamingContent && (agentPhase || isCompacting) && (` and add before it:
```tsx
              {conversation && agentConversation && agentRunning && (
                <div className="conv-working">
                  <span className="conv-gutter" aria-hidden="true"><AgentAvatar avatar={agentConversation.agent.avatar} size={20} /></span>
                  <span className="conv-working-text">
                    {t("agents.chat.working", { name: agentConversation.agent.name })}
                    {!hasStreamingContent && (agentPhase || isCompacting) && phaseLabel(agentPhase, t, isCompacting) ? ` · ${phaseLabel(agentPhase, t, isCompacting)}` : ""}
                  </span>
                </div>
              )}
```
Leave the `role="status" aria-live="polite"` region unchanged.

11. **Approval dialog speaker**: give `ExtensionDialog` an optional `speaker?: { name: string; avatar: AgentListItem["avatar"] }` prop. As the first child of the expanded dialog box (the element carrying `ref={dialogRef}`), render
```tsx
          {speaker && (
            <div className="conv-dialog-speaker">
              <AgentAvatar avatar={speaker.avatar} size={20} />
              <span>{t("agents.chat.asks", { name: speaker.name })}</span>
            </div>
          )}
```
and in the collapsed button replace the `{t("chat.extensionPending")}` text with `{speaker ? t("agents.chat.asks", { name: speaker.name }) : t("chat.extensionPending")}`. At the call site pass `speaker={conversation ? agentConversation?.agent : undefined}`.

12. **AppShell** (`<ChatWindow` ~2585), next to `unreadCount=`:
```tsx
              agentConversation={(() => {
                const item = activeAgent ? agents.find((agent) => agent.name === activeAgent) : undefined;
                return item ? { agent: item, role: agentDetail?.name === item.name ? agentDetail.role : undefined, globalPaused: allPaused, quietHours: healthState?.health.quietHours ?? false } : undefined;
              })()}
```

- [ ] **Step 4: Run tests, gates and manual check**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/conversation/*.test.mjs components/*.test.mjs components/agents/*.test.mjs`
Expected: PASS. `node_modules/.bin/tsc --noEmit`, `npm run lint`: clean.

Manual, in the running dev server (`lsof -nP -iTCP:30141 -sTCP:LISTEN`; reuse it, never start a second one). On an agent thread:
- headers group by author;
- user messages are left-aligned with the orange rule;
- with details off, tool calls are hidden and `agent_notify` stays visible;
- the details switch persists after a reload;
- an ordinary session looks unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/ChatWindow.tsx components/AppShell.tsx components/agents/conversation/chat-window-conversation.test.mjs
git commit -m "feat(agents): conversation layout in the agent thread with presence header"
```

---

### Task 7: Expandable rail (conversation list)

**Files:**
- Modify: `components/agents/AgentRail.tsx`
- Modify: `components/AppShell.tsx` (desktop `<AgentRail` ~2097)
- Test: `components/agents/AgentRail.test.mjs` (extend)

**Interfaces:**
- Consumes: `formatListTime` (Task 1), `loadRailExpanded`, `savePref`, `RAIL_EXPANDED_KEY` (Task 1), CSS `.agent-rail-expanded`, `.agent-row*`, `.agent-rail-action` (Task 3), keys `agents.rail.expand|collapse`, `agents.presence.needsInput|failed` (Task 4).
- Produces: `AgentRail` props `expanded?: boolean; onExpandedChange?: (next: boolean) => void` (vertical only).

- [ ] **Step 1: Write the failing test** (append to `AgentRail.test.mjs`)

```js
test("the vertical rail expands into a conversation list in rail order, with a persisted toggle", () => {
  assert.match(rail, /const list = vertical && expanded;/);
  assert.match(rail, /className=\{list \? "agent-rail agent-rail-expanded" : vertical \? "agent-rail" : "agent-rail agent-rail-horizontal"\}/);
  assert.match(rail, /aria-expanded=\{expanded\}/);
  assert.match(rail, /t\(expanded \? "agents\.rail\.collapse" : "agents\.rail\.expand"\)/);
  assert.match(rail, /formatListTime\(agent\.lastActivityAt, locale\)/);
  assert.match(rail, /data-state=\{agent\.state\}/);
  assert.match(rail, /agents\.map\(\(agent, index\) =>/);
  assert.match(shell, /expanded=\{railExpanded\}/);
  assert.match(shell, /savePref\(RAIL_EXPANDED_KEY, next\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/AgentRail.test.mjs`
Expected: FAIL on the new test only.

- [ ] **Step 3: Implement**

`AgentRail.tsx`:
1. Imports: add `ChevronsLeft, ChevronsRight` to the `lucide-react` import; `import { formatListTime } from "./conversation/list-time";`.
2. Props: add `expanded = false, onExpandedChange` to the destructuring and `expanded?: boolean; onExpandedChange?: (next: boolean) => void;` to the type.
3. After `const vertical = …`, add `const list = vertical && expanded;` and `const showLabels = !vertical || list;`.
4. `<nav … className=…>` → `className={list ? "agent-rail agent-rail-expanded" : vertical ? "agent-rail" : "agent-rail agent-rail-horizontal"}`.
5. First child of `<nav>`, before `agents.map`:
```tsx
        {vertical && onExpandedChange && (
          <button type="button" onClick={() => onExpandedChange(!expanded)} aria-expanded={expanded} aria-label={t(expanded ? "agents.rail.collapse" : "agents.rail.expand")} title={t(expanded ? "agents.rail.collapse" : "agents.rail.expand")} className={cn(railButtonClass, list && "self-end")}>
            {expanded ? <ChevronsLeft aria-hidden="true" /> : <ChevronsRight aria-hidden="true" />}
          </button>
        )}
```
6. Inside `agents.map((agent, index) => …)`, keep the existing `<button>` for `!list`. For `list` return this instead (same `key`, `onClick`, `aria-current`, `aria-label`, `title` as today):
```tsx
          list ? (
            <button
              key={agent.name}
              type="button"
              onClick={() => onSelectAgent(agent.name)}
              aria-current={agent.name === activeAgent ? "true" : undefined}
              aria-label={[agent.name, agent.unread > 0 ? t("agents.rail.unread", { count: agent.unread }) : "", agent.state === "needs_input" ? t("agents.rail.needsInput") : agent.running ? t("agents.rail.running") : agent.state === "failed" ? t("agents.rail.failed") : "", agent.lastPreview ?? ""].filter(Boolean).join(", ")}
              title={agent.name + (index < 9 ? ` · Ctrl+Alt+${index + 1}` : "")}
              className="agent-row"
              data-unread={agent.unread > 0 || undefined}
            >
              <AgentAvatar avatar={agent.avatar} size={32} running={agent.running} state={agent.state} selected={agent.name === activeAgent} title={agent.name} />
              <span className="agent-row-text" aria-hidden="true">
                <span className="agent-row-line1">
                  <span className="agent-row-name">{agent.name}</span>
                  {agent.unread > 0 && <span className="agent-row-unread">{agent.unread}</span>}
                  {agent.lastActivityAt && <span className="agent-row-time">{formatListTime(agent.lastActivityAt, locale)}</span>}
                </span>
                <span className="agent-row-preview" data-state={agent.state}>
                  {agent.state === "needs_input" ? t("agents.presence.needsInput") : agent.state === "failed" ? t("agents.presence.failed") : agent.lastPreview ?? ""}
                </span>
              </span>
            </button>
          ) : ( /* existing button unchanged */ )
```
The existing `aria-current={agent.name === activeAgent ? "true" : undefined}` line stays in the compact button, so the earlier test keeps matching.
7. Footer labels: replace each `{!vertical && <span className="ml-1 text-xs">…</span>}` with `{showLabels && …}`, and add `list && "agent-rail-action w-full"` to the `cn(...)` of the new-agent, inbox, tasks, sessions and pause buttons. For the new-agent button, add `{list && <span className="ml-1 text-xs">{t("agents.rail.new")}</span>}` after the `<Plus/>`; for sessions, `{list && <span className="ml-1 text-xs">{t("agents.rail.sessions")}</span>}`; for pause, `{list && <span className="ml-1 text-xs">{paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")}</span>}`.

`AppShell.tsx`:
```tsx
import { loadRailExpanded, RAIL_EXPANDED_KEY, savePref } from "./agents/conversation/prefs";
// near the other agent state:
  const [railExpanded, setRailExpanded] = useState(loadRailExpanded);
  const changeRailExpanded = useCallback((next: boolean) => {
    setRailExpanded(next);
    savePref(RAIL_EXPANDED_KEY, next);
  }, []);
```
On the desktop `<AgentRail` (the `{!isMobile && <AgentRail` one) add `expanded={railExpanded}` and `onExpandedChange={changeRailExpanded}`. The mobile one is unchanged.

- [ ] **Step 4: Run tests, gates and manual check**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/AgentRail.test.mjs components/agents/conversation/*.test.mjs`
Expected: PASS. `tsc`, `lint`: clean.

Manual:
- toggle the list and reload: the state persists;
- `Ctrl+Alt+1` still opens the first agent and `Alt+↓` the next unread one;
- the health popover opens to the right of the list;
- on a phone width the horizontal rail is unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/agents/AgentRail.tsx components/AppShell.tsx components/agents/AgentRail.test.mjs
git commit -m "feat(agents): expandable agent rail as a conversation list"
```

---

### Task 8: Docs and full verification

**Files:**
- Modify: `docs/agents/long-term-agents.md` (new section "Conversation view" after "Day separators")
- Modify: `docs/agents/ui.md` (one bullet)

- [ ] **Step 1: Write the docs**

`docs/agents/long-term-agents.md`, new section:
```markdown
## Conversation view (`components/agents/conversation/*`, `app/agent-conversation.css`)
- On only for a trusted thread with agent data (`ChatWindow` `conversation = Boolean(trustedAgentName && agentConversation)`); ordinary sessions get no prop and no data attribute.
- `MessageView` `conversation` (boolean, in the memo comparator): user messages plain and left-aligned (`PlainBubble` instead of `Chamfer`), assistant without model label or cyan border, model and usage on hover only, each block wrapped in `data-block` / `data-tool`.
- Author groups: one `createGroupTracker()` per render, fed by `renderMessage` (top-level `message` items only) and the process branch. A day separator, the unread divider, a system item or 5 min (`GROUP_GAP_MS`) opens a new group; recall cards and tool results neither open nor break one.
- Details switch (`localStorage["pi-agent-details"]`, default off): `data-agent-details="off"` hides thinking, tool calls and process narration in CSS; `agent_notify` / `agent_approve` / `agent_delegate` stay. A finished turn without a speech act renders nothing; a search or deep-link reveal keeps today's `ProcessDetailsGroup`.
- Event cards fold to a centered system line (failed = red + the word); delegation results stay open.
- Header: `presenceOf` (needs input > working > failed > paused > quiet hours > available), first role line, the details switch. No new request: rail poll, `AgentDetail`, health poll.
- Rail list: `expanded` (desktop only, `localStorage["pi-agent-rail-expanded"]`, default expanded at ≥ 1280 px). Rail order is kept so `Ctrl+Alt+n` and `Alt+↑/↓` still target the same agents.
- Known limits: when the render window starts inside a group, the first visible item has no header until earlier items load; an interrupted turn made only of tool calls (no final answer) keeps its agent header with nothing under it while details are off.
```

`docs/agents/ui.md`, add a bullet:
```markdown
- **Agent conversation view** (`app/agent-conversation.css`): prose capped at 72ch, body +1 px over the chat font setting (15 px by default), line-height 1.6, a 40 px avatar gutter, no `font-hud` in the thread or the list. Rules are scoped under `[data-chat-style="agent"]`.
```

- [ ] **Step 2: Full verification**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" npm test
```
Expected: tsc and lint clean; the suite green except the known `lib/codemode-settings.test.mjs` failure. Report any other failure with its output.

- [ ] **Step 3: Commit**

```bash
git add docs/agents/long-term-agents.md docs/agents/ui.md
git commit -m "docs(agents): conversation view notes"
```
