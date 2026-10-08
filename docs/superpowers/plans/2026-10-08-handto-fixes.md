# "Hand to…" / "Ask a review by…" fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hand-over and review flows work for real users: long quotes go through, the user sees what happened (toast, pending strip, push, readable result card), the buttons are reachable on touch and keyboard, and the route enforces the review contract.

**Architecture:** Server first (route limits and checks, delegation event fields, requester push), then UI. Logic that can go wrong sits in pure tested helpers (`components/agents/queue-task-view.ts`, `outgoingRequests` in `components/agents/task-view.ts`, `lib/agents/events.ts`). Components get render tests where SSR works (`AgentEventCard`, `MessageView`) and source assertions elsewhere, as their sibling tests do. `kick.ts` keeps source pins, because importing it loads `rpc-manager`.

**Tech Stack:** Next.js 16 / React 19 client components, inline styles + `app/globals.css`, `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts`, `node:test` `.test.mjs` through jiti or `--experimental-strip-types`.

**Spec:** `/home/ubuntu/Workspace/soulkyu/pi-web-agents/docs/superpowers/specs/2026-10-08-handto-fixes-design.md` (binding). Evidence: `/home/ubuntu/reports/pi-web-agentic/ux/handto-review.md`. Read both alongside this plan.

## Global Constraints

1. Old Safari iOS 16.2: no RegExp lookbehind in client code; no API newer than Safari 16.2.
2. Every visible string through `useI18n()` (or `localeText` for pushes) with keys in all four of `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts`.
3. Accessibility: keyboard reachable, visible focus, accessible names, information not by colour alone, reduced motion honoured.
4. Mobile first-class (≤ 640 px, software keyboard open).
5. Escape in dialogs/popovers calls `preventDefault()`; dialogs use `role="dialog"`.
6. No new prop to `MessageView` whose identity changes per streamed token / tool tick (`MessageView` is `memo()`ed; check its comparator when adding props).
7. Security invariants unchanged: quote stays fenced (`fenceExternal`), delegation card stays display-only and never reaches the model except via explicit Inject, secrets redacted before the card, route accepts `requestedBy: "user"` only, review stays isolated with the closed tool allowlist.
8. Tests: `.test.mjs`, `node:test`, no TS syntax; run with `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test …` (`[name]` paths are globs for the CLI). Gates: `node_modules/.bin/tsc --noEmit`, `npm run lint` (clean), full suite (known pre-existing failure `lib/codemode-settings.test.mjs` "the mode is read as the codemode extension reads it").
9. No new dependency, no `package.json` change. Conventional Commits, no AI attribution, explicit `git add`, never `.superpowers/`. Never `next build`/`next dev` in the worktree.
10. Docs: update `docs/agents/long-term-agents.md` / `docs/agents/agent-ops.md` where behaviour changes.

Out of scope (spec, binding): B6 cancelled delegation card, B7 retry on a failed delegation card, B8 non-agent targets / normal-session sources, B9 reviewer read access to the requester's files.

## Review Focus

1. **A quote with emoji or CJK right at the 20 000-character cut, or exactly 20 000 characters long.** Expected: the client never splits a surrogate pair, never sends more than the route accepts, and a 20 000-character quote is accepted. Pinned by the `clipQuote` surrogate and cap tests in Task 4 and the 20 000-quote route test in Task 1.
2. **The target agent is deleted, or the requester thread's agent goes away, while the dialog is open.** Expected: the route's 404 "Agent not found" / 400 "deliverTo must name an existing agent" shows as a localized red message, not raw English. Pinned by the `queueErrorKey` tests, which also pin the route's wording, in Task 4.
3. **The delegation card cannot be appended** (requester deleted or quarantined after queueing, thread open error). Expected: no silent end and no double push. The executing agent's failure push still fires as a fallback, and the requester push fires only when its card exists. Pinned by the `if (delivered)` / fallback source test in Task 3.
4. **A review quote whose first line is blank, a markdown heading or list marker, or 200 characters long.** Expected: an informative `Review: …` title of at most 60 characters, and never an empty `Review: ` line. Pinned by the `reviewExcerpt` tests and the `filter(Boolean)` source pin in Task 4.
5. **Cards written before this change (no `purpose` / `clipped` / `handedFrom`) and malformed new fields** (`clipped: "yes"`, `clipped: false`, `purpose: "other"`, `handedFrom: 3`). Expected: legacy cards render as today ("Result from X", no truncation note), and malformed ones are rejected by the guard and never rendered. Pinned by the `isAgentEventData` tests and the legacy render test in Task 2.

---

## Before you start (every task)

- Branch `feat/handto-fixes`. Line numbers below were verified at `bad64e6`. Earlier tasks of this plan shift them, so anchor every edit on the quoted code, not the number. **Re-read each file before editing it.**
- **Sequential, never in parallel.** All tasks append keys to the same four locale files. Files shared between tasks:
  - `components/agents/QueueTaskDialog.tsx`: Tasks 4 and 6.
  - `components/ChatWindow.tsx`: Tasks 4, 6 and 8.
  - `components/agents/AgentEventCard.tsx`: Tasks 2 and 7.
  - `lib/agents/events.ts`: Task 2.
  - `app/globals.css`: Tasks 7 and 8.
  - `docs/agents/long-term-agents.md`: Tasks 1–8.
- i18n: append new keys **at the end of the `messages` object** of each locale file, after its last entry (at `bad64e6` that is `"agents.tasks.promptTooLong": …,` at line 1716), just before the closing `  },`. `lib/i18n/agents-keys.test.mjs` already checks that every `agents.*` key exists in all four locales with the same `{placeholders}`.
- Test runner (repo root): `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test <files>`. For `app/api/agents/[name]/…` pass the glob `"app/api/agents/*/tasks/route.test.mjs"` (the CLI globs `[name]`).
- Read before editing: `AGENTS.md`, `docs/agents/long-term-agents.md` (all tasks), `docs/agents/agent-ops.md` (Task 3), `docs/agents/client-platform.md` (Tasks 5, 8).

## File structure

| File | Task | Responsibility |
|---|---|---|
| `app/api/agents/[name]/tasks/route.ts` | 1 | `QUOTE_MAX = 20_000`, review purpose ⇒ isolated + `kind: "review"` |
| `lib/agents/events.ts` | 2 | `DELEGATION_TEXT_MAX`, `clipped`, `purpose`, `handedFrom`, guard |
| `lib/agents/thread-run.ts` | 2 | task card of a user hand-over carries `handedFrom` |
| `components/agents/AgentEventCard.tsx` | 2, 7 | review label, truncation note, Inject suffix, provenance; markdown + fold |
| `components/agents/AgentEventCard.test.mjs` (new) | 2, 7 | SSR render tests of the card |
| `lib/agent-ops/kick.ts` | 3 | requester push with the card's entry id |
| `lib/web-push.ts` | 3 | `localeText` keys `agentDelegationDone` / `agentDelegationFailed` |
| `components/agents/queue-task-view.ts` (new) | 4, 6 | pure: `QUOTE_MAX`, `clipQuote`, `reviewExcerpt`, `queueErrorKey`, `HandTarget` |
| `components/agents/queue-task-view.test.mjs` (new) | 4 | helper logic + route wording pins |
| `components/agents/QueueTaskDialog.tsx` | 4, 6 | feedback, clipping, copy, defaults, hint; target select + status |
| `components/ChatWindow.hand-to.test.mjs` (new) | 4, 6, 8 | ChatWindow / AppShell source pins for this flow |
| `components/MessageView.tsx` | 5 | actions visible on touch, phones and focus-within |
| `components/AppShell.tsx` | 6 | `handToAgents` as `{ name, paused, running }` |
| `components/agents/task-view.ts` | 8 | `outgoingRequests` |
| `components/agents/PendingRequests.tsx` (new) | 8 | pending strip, visible-only poll, Cancel |
| `components/agents/PendingRequests.test.mjs` (new) | 8 | source pins + CSS rule |

---

### Task 1: Quote limit 20 000 and review consistency (B1 + B5)

**Files:**
- Modify: `app/api/agents/[name]/tasks/route.ts:15` (`QUOTE_MAX`), `:52-53` (review checks), `:66` (`kind`)
- Test: `app/api/agents/[name]/tasks/route.test.mjs:22`, `:80`, plus two new tests
- Docs: `docs/agents/long-term-agents.md:178-179`

**Interfaces:**
- Consumes: nothing new.
- Produces: the route accepts `quote.length <= 20_000`, and its source line `const QUOTE_MAX = 20_000;` is pinned by Task 4's mirror test. `purpose: "review"` without `target: "isolated"` → 400 `"a review runs isolated"`. `purpose: "review"` with `kind` absent stores `kind: "review"`.

- [ ] **Step 1: Write the failing tests**

In `app/api/agents/[name]/tasks/route.test.mjs`, line 22, change `{ deliverTo: "Martin", quote: "q".repeat(8001) }` to:

```js
    { deliverTo: "Martin", quote: "q".repeat(20_001) }, { quote: "orphan" },
```

(keep the rest of the array as is). Line 80, change `assert.match(source, /QUOTE_MAX = 8000/);` to:

```js
  assert.match(source, /QUOTE_MAX = 20_000/);
```

Append at the end of the file:

```js
test("a quote of exactly 20 000 characters is accepted", async () => {
  const response = await post("Lea", { prompt: "do it", requestedBy: "user", deliverTo: "Martin", quote: "q".repeat(20_000) });
  assert.equal(response.status, 201);
});

test("a review purpose needs an isolated target and implies kind review when kind is absent", async () => {
  for (const body of [
    { ...review, kind: undefined, tools: undefined, target: "thread" },
    { ...review, kind: undefined, tools: undefined, target: undefined },
  ]) assert.equal((await post("Lea", body)).status, 400, JSON.stringify(body).slice(0, 100));
  const response = await post("Lea", { ...review, kind: undefined });
  assert.equal(response.status, 201);
  const task = store.getTask((await response.json()).task.id);
  assert.equal(task.kind, "review");
  assert.equal(task.target, "isolated");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test "app/api/agents/*/tasks/route.test.mjs"`
Expected: FAIL. The 20 000 quote gets 400, `/QUOTE_MAX = 20_000/` does not match, a review purpose on a thread target gets 201, and the stored `kind` is `"task"`.

- [ ] **Step 3: Implement**

`route.ts:15`:

```ts
const QUOTE_MAX = 20_000;
```

`route.ts:52-53`, replace

```ts
  const isolated = target === "isolated";
  if (kind === "review" && !isolated) return NextResponse.json({ error: "a review runs isolated" }, { status: 400 });
```

with

```ts
  const isolated = target === "isolated";
  if ((kind === "review" || purpose === "review") && !isolated) return NextResponse.json({ error: "a review runs isolated" }, { status: 400 });
```

`route.ts:66`, in the `createTask({ … })` call, replace `kind: kind === "review" ? "review" : "task",` with:

```ts
kind: kind === "review" || (kind === undefined && purpose === "review") ? "review" : "task",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test "app/api/agents/*/tasks/route.test.mjs" components/agents/QueueTaskDialog.test.mjs`
Expected: PASS.

- [ ] **Step 5: Document**

In `docs/agents/long-term-agents.md`:
- Line 178: replace `appends \`quote\` (string, ≤ 8000)` with `appends \`quote\` (string, ≤ 20 000: \`QUOTE_MAX\`, equal to \`PROMPT_MAX\`; \`agent_delegate\`'s own 8000 task limit is unchanged)`.
- Line 179: replace `The route 400s \`kind: "review"\` without \`target: "isolated"\`,` with `The route 400s \`kind: "review"\` or \`purpose: "review"\` without \`target: "isolated"\` (a review purpose without \`kind\` stores \`kind: "review"\`),`.

- [ ] **Step 6: Commit**

```bash
git add "app/api/agents/[name]/tasks/route.ts" "app/api/agents/[name]/tasks/route.test.mjs" docs/agents/long-term-agents.md
git commit -m "fix(agents): accept 20 000-character hand-over quotes; a review purpose runs isolated"
```

- [ ] **Step 7: Manual check (controller, after deployment)**

1. Desktop, Julien's thread: use "Hand to…" on an assistant message longer than 8000 characters (Julien has two at about 10.8k) → submit → the task is queued (no 400), and the hand-over runs in Martin's thread.
2. Desktop: "Ask a review by…" on a normal message → queued, runs isolated, and its card arrives in Julien's thread.
3. `curl` (as the logged-in browser, cookie) `POST /api/agents/Martin/tasks` with `{"prompt":"x","requestedBy":"user","deliverTo":"Julien","purpose":"review"}` → 400 `a review runs isolated`.
4. Phone 390 px: repeat step 1 → queued.

---

### Task 2: Delegation card: summary cap, truncation flag, purpose, provenance (B2 + B4)

**Files:**
- Modify: `lib/agents/events.ts:12` (constants), `:20-24` (type), `:30-41` (guard), `:55-56` (`buildTaskEvent`), `:66-73` (`delegationEventOfTask`)
- Modify: `lib/agents/thread-run.ts:14-18` (`eventOfTask`)
- Modify: `components/agents/AgentEventCard.tsx:14-27` (delegation branch), `:35` (task provenance)
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (append 5 keys)
- Test: `lib/agents/events.test.mjs:82-85` (update) + new tests; `lib/agents/thread-run.test.mjs` new test; create `components/agents/AgentEventCard.test.mjs`
- Docs: `docs/agents/long-term-agents.md:178`, `:180`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export const DELEGATION_TEXT_MAX = 16_000;` in `lib/agents/events.ts`.
  - The delegation variant of `AgentEventData` gains `purpose?: "review" | "handoff"; clipped?: true`. The `schedule | task` variant gains `handedFrom?: string`.
  - `buildTaskEvent(input: { taskId: string; title: string; requestedBy?: string; handedFrom?: string })`.
  - Task 7 relies on the delegation branch of `AgentEventCard` and on `components/agents/AgentEventCard.test.mjs` with its `render(data, props)` helper and `done` fixture.

- [ ] **Step 1: Write the failing tests**

`lib/agents/events.test.mjs` line 85: in the existing `assert.deepEqual({ ...card, summary: card.summary.length }, …)`, the expected object becomes:

```js
  assert.deepEqual({ ...card, summary: card.summary.length }, { version: 1, kind: "delegation", taskId: "t9", title: "research", from: "Lea", status: "completed", summary: 3000, runSessionId: "s1", tainted: true, purpose: "handoff" });
```

Append to `lib/agents/events.test.mjs`:

```js
test("delegation cards keep up to 16 000 chars, flag a cut and carry the purpose; other kinds keep EVENT_TEXT_MAX", () => {
  const base = { id: "t1", title: "review", agent: "Martin", status: "completed", sessionId: "s1", kind: "review", usage: { externalTools: false } };
  const exact = ev.delegationEventOfTask({ ...base, result: "a".repeat(ev.DELEGATION_TEXT_MAX) });
  assert.equal(ev.DELEGATION_TEXT_MAX, 16_000);
  assert.equal(exact.summary.length, 16_000);
  assert.equal("clipped" in exact, false);
  assert.equal(exact.purpose, "review");
  const long = ev.delegationEventOfTask({ ...base, result: "b".repeat(20_000) });
  assert.equal(long.summary.length, 16_001);
  assert.ok(long.summary.endsWith("…"));
  assert.equal(long.clipped, true);
  assert.equal(ev.delegationEventOfTask({ ...base, status: "failed", error: "e".repeat(17_000), result: undefined }).clipped, true);
  assert.equal(ev.delegationEventOfTask({ ...base, kind: "task", result: "x" }).purpose, "handoff");
  assert.equal(ev.buildWebhookEvent({ taskId: "w", triggerId: "g", title: "x", status: "completed", summary: "c".repeat(5000) }).summary.length, ev.EVENT_TEXT_MAX + 1);
});

test("the guard accepts legacy delegation cards and rejects malformed purpose or clipped", () => {
  const long = ev.delegationEventOfTask({ id: "t1", title: "r", agent: "Martin", status: "completed", result: "b".repeat(20_000), kind: "review" });
  assert.equal(ev.isAgentEventData(long), true);
  const legacy = { ...long };
  delete legacy.purpose;
  delete legacy.clipped;
  assert.equal(ev.isAgentEventData(legacy), true);
  assert.equal(ev.isAgentEventData({ ...long, purpose: "other" }), false);
  assert.equal(ev.isAgentEventData({ ...long, clipped: "yes" }), false);
  assert.equal(ev.isAgentEventData({ ...long, clipped: false }), false);
});

test("a task card may carry handedFrom, and only a string", () => {
  const card = ev.buildTaskEvent({ taskId: "t", title: "x", requestedBy: "user", handedFrom: "Julien" });
  assert.equal(card.handedFrom, "Julien");
  assert.equal(ev.isAgentEventData(card), true);
  assert.equal(ev.isAgentEventData({ ...card, handedFrom: 3 }), false);
  assert.equal("handedFrom" in ev.buildTaskEvent({ taskId: "t", title: "x" }), false);
});
```

Append to `lib/agents/thread-run.test.mjs`:

```js
test("a user hand-over's task card carries handedFrom; an agent request and a plain task do not", () => {
  const plain = { ...task, kind: "task", triggerId: undefined };
  assert.equal(eventOfTask({ ...plain, requestedBy: "user", deliverTo: "Julien" }).handedFrom, "Julien");
  assert.equal("handedFrom" in eventOfTask({ ...plain, requestedBy: "alice", deliverTo: "alice" }), false);
  assert.equal("handedFrom" in eventOfTask({ ...plain, requestedBy: "user" }), false);
});
```

Create `components/agents/AgentEventCard.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AgentEventCard } = await jiti.import("./AgentEventCard.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const ev = await jiti.import("@/lib/agents/events.ts");

const render = (data, props = {}) => renderToStaticMarkup(
  React.createElement(I18nProvider, null, React.createElement(AgentEventCard, { message: ev.agentEventToUiMessage(data), ...props })),
);
const done = { id: "t1", title: "check plan", agent: "Martin", status: "completed", result: "ok", sessionId: "s1", kind: "review", usage: { externalTools: false } };

test("a review card says Review by; a hand-over card and an older card without purpose say Result from", () => {
  assert.match(render(ev.delegationEventOfTask(done)), /Review by Martin/);
  assert.match(render(ev.delegationEventOfTask({ ...done, kind: "task" })), /Result from Martin/);
  const legacy = { ...ev.delegationEventOfTask(done) };
  delete legacy.purpose;
  assert.match(render(legacy), /Result from Martin/);
});

test("a clipped card says so and its Inject button says it injects the truncated text", () => {
  const html = render(ev.delegationEventOfTask({ ...done, result: "r".repeat(20_000) }), { onInject: () => {}, onOpenSession: () => {} });
  assert.match(html, /truncated — see the run/);
  assert.match(html, /Inject \(truncated\)/);
  const whole = render(ev.delegationEventOfTask(done), { onInject: () => {} });
  assert.doesNotMatch(whole, /truncated/);
  assert.match(whole, /Inject into the conversation/);
});

test("a user hand-over's task card names the requester; a plain task card does not", () => {
  assert.match(render(ev.buildTaskEvent({ taskId: "t", title: "x", requestedBy: "user", handedFrom: "Julien" })), /handed over from Julien/);
  assert.doesNotMatch(render(ev.buildTaskEvent({ taskId: "t", title: "x", requestedBy: "user" })), /handed over/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test lib/agents/events.test.mjs lib/agents/thread-run.test.mjs components/agents/AgentEventCard.test.mjs`
Expected: FAIL. `DELEGATION_TEXT_MAX` is undefined, the summary is 2001, there is no `purpose` / `handedFrom`, and the card text has no "Review by" or "truncated".

- [ ] **Step 3: Implement `lib/agents/events.ts`**

After line 12 (`export const EVENT_TEXT_MAX = 2000;`) add:

```ts
/** A delegation result is display-only and often long (a review): keep more of it than other cards. */
export const DELEGATION_TEXT_MAX = 16_000;
```

Lines 20-24, the type becomes:

```ts
export type AgentEventData =
  /** `handedFrom`: the requester thread of a user hand-over (shown as provenance in the target's thread). */
  | { version: 1; kind: "schedule" | "task"; taskId: string; triggerId?: string; title: string; fireReason?: EventFireReason; requestedBy?: string; handedFrom?: string }
  /** D14: another agent's result, display-only. `tainted`: the run read web content or a webhook payload. `clipped`: the summary was cut at DELEGATION_TEXT_MAX. Older cards have neither `purpose` nor `clipped`. */
  | { version: 1; kind: "delegation"; taskId: string; title: string; from: string; status: "completed" | "failed"; summary: string; runSessionId?: string; tainted: boolean; purpose?: "review" | "handoff"; clipped?: true }
  | { version: 1; kind: "webhook"; taskId: string; triggerId: string; title: string; status: "completed" | "failed"; summary: string; runSessionId?: string; taskKind?: "schedule" | "webhook"; usage?: EventUsage };
```

Guard, lines 32-41, replace the `delegation` and `schedule | task` branches with:

```ts
  if (value.kind === "delegation") {
    return typeof value.from === "string" && (value.status === "completed" || value.status === "failed") && typeof value.summary === "string" && typeof value.tainted === "boolean"
      && (value.runSessionId === undefined || typeof value.runSessionId === "string")
      && (value.purpose === undefined || value.purpose === "review" || value.purpose === "handoff")
      && (value.clipped === undefined || value.clipped === true);
  }
  if (value.kind === "schedule" || value.kind === "task") {
    const reason = value.fireReason;
    const reasonOk = reason === undefined || (isRecord(reason) && (reason.source === "schedule" || reason.source === "webhook" || reason.source === "manual"));
    return reasonOk && (value.triggerId === undefined || typeof value.triggerId === "string")
      && (value.requestedBy === undefined || typeof value.requestedBy === "string")
      && (value.handedFrom === undefined || typeof value.handedFrom === "string");
  }
```

Lines 55-56, `buildTaskEvent` becomes:

```ts
export const buildTaskEvent = (input: { taskId: string; title: string; requestedBy?: string; handedFrom?: string }): AgentEventData =>
  ({ version: 1, kind: "task", taskId: input.taskId, title: clipTitle(input.title), ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}), ...(input.handedFrom ? { handedFrom: input.handedFrom } : {}) });
```

Lines 66-73, `delegationEventOfTask` becomes:

```ts
export function delegationEventOfTask(task: { id: string; title: string; agent?: string; status: string; result?: string; error?: string; sessionId?: string; kind?: string; usage?: Pick<RunUsage, "externalTools"> }): AgentEventData | null {
  if (!task.agent || (task.status !== "completed" && task.status !== "failed")) return null;
  const text = (task.status === "completed" ? task.result : task.error) ?? "";
  return {
    version: 1, kind: "delegation", taskId: task.id, title: clipTitle(task.title), from: task.agent, status: task.status,
    summary: clip(text, DELEGATION_TEXT_MAX), ...(text.length > DELEGATION_TEXT_MAX ? { clipped: true as const } : {}), ...(task.sessionId ? { runSessionId: task.sessionId } : {}),
    tainted: task.kind === "webhook" || (task.usage?.externalTools ?? true),
    purpose: task.kind === "review" ? "review" : "handoff",
  };
}
```

- [ ] **Step 4: Implement `lib/agents/thread-run.ts:14-18`**

```ts
export function eventOfTask(task: AgentTask): AgentEventData {
  return task.kind === "schedule" && task.triggerId
    ? buildScheduleEvent({ taskId: task.id, triggerId: task.triggerId, title: task.title, fireReason: task.fireReason })
    : buildTaskEvent({ taskId: task.id, title: task.title, requestedBy: task.requestedBy, handedFrom: task.requestedBy === "user" ? task.deliverTo : undefined });
}
```

- [ ] **Step 5: Implement `components/agents/AgentEventCard.tsx`**

Lines 14-27 (delegation branch) become:

```tsx
  if (data.kind === "delegation") {
    return (
      <div className="agent-event" role="note">
        <div className="agent-event-head">
          <span aria-hidden>↩</span> <strong>{t(data.purpose === "review" ? "agents.event.reviewResult" : "agents.event.delegationResult", { name: data.from })}</strong> · <span>{data.title}</span>
          {data.status === "failed" && <span className="agent-event-failed">{t("agents.event.failed")}</span>}
          {data.tainted && <span className="agent-event-tainted" title={t("agents.event.taintedHint")}>{t("agents.event.tainted")}</span>}
          {data.runSessionId && onOpenSession && <button type="button" onClick={() => onOpenSession(data.runSessionId!)} className="agent-event-link">{t("agents.event.seeRun")}</button>}
          {onInject && data.summary && <button type="button" onClick={() => onInject(data.from, data.summary)} title={data.clipped ? t("agents.event.injectClippedHint") : undefined} className="agent-event-link">{t(data.clipped ? "agents.event.injectClipped" : "agents.event.inject")}</button>}
        </div>
        <div className="agent-event-summary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{data.summary}</div>
        {data.clipped && <div className="agent-event-reason" style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("agents.event.clipped")}</div>}
      </div>
    );
  }
```

After line 35 (the `data.requestedBy !== "user"` span) add:

```tsx
        {data.kind === "task" && data.handedFrom && <span className="agent-event-reason" style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("agents.tasks.handedFrom", { name: data.handedFrom })}</span>}
```

- [ ] **Step 6: i18n (append to each locale)**

`en.ts`:
```ts
    "agents.event.reviewResult": "Review by {name}",
    "agents.event.clipped": "truncated — see the run for the full text",
    "agents.event.injectClipped": "Inject (truncated)",
    "agents.event.injectClippedHint": "Injects the truncated text this card holds, not the full result",
    "agents.tasks.handedFrom": "handed over from {name}",
```
`fr.ts`:
```ts
    "agents.event.reviewResult": "Relecture par {name}",
    "agents.event.clipped": "tronqué — voir l'exécution pour le texte complet",
    "agents.event.injectClipped": "Injecter (tronqué)",
    "agents.event.injectClippedHint": "Injecte le texte tronqué de cette carte, pas le résultat complet",
    "agents.tasks.handedFrom": "confié depuis le fil de {name}",
```
`zh-CN.ts`:
```ts
    "agents.event.reviewResult": "{name} 的审阅",
    "agents.event.clipped": "已截断——完整内容请查看运行记录",
    "agents.event.injectClipped": "注入（已截断）",
    "agents.event.injectClippedHint": "注入此卡片中已截断的文本，而非完整结果",
    "agents.tasks.handedFrom": "由 {name} 移交",
```
`zh-TW.ts`:
```ts
    "agents.event.reviewResult": "{name} 的審閱",
    "agents.event.clipped": "已截斷——完整內容請查看執行記錄",
    "agents.event.injectClipped": "注入（已截斷）",
    "agents.event.injectClippedHint": "注入此卡片中已截斷的文字，而非完整結果",
    "agents.tasks.handedFrom": "由 {name} 移交",
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test lib/agents/events.test.mjs lib/agents/thread-run.test.mjs components/agents/AgentEventCard.test.mjs lib/agents/inbox.test.mjs hooks/useAgentSession.agent-events.test.mjs lib/i18n/agents-keys.test.mjs lib/i18n/messages.test.mjs`
Expected: PASS.

- [ ] **Step 8: Document**

In `docs/agents/long-term-agents.md`:
- Line 178: replace the closing `the \`task\` event card carries \`requestedBy\`.` with `the \`task\` event card carries \`requestedBy\`, and the card of a user hand-over (\`requestedBy: "user"\` with \`deliverTo\`, dialog or \`@Name\`) also carries \`handedFrom: deliverTo\`, shown as "handed over from X" in the target's thread.`
- Line 180: replace `\`summary\` = redacted \`result ?? error\` clipped to 2000, \`runSessionId\`, \`tainted\`)` with `\`summary\` = redacted \`result ?? error\` clipped to 16 000 (\`DELEGATION_TEXT_MAX\`; other kinds keep \`EVENT_TEXT_MAX\` 2000), \`clipped: true\` when cut, \`runSessionId\`, \`tainted\`, \`purpose: "review" | "handoff"\` from \`task.kind\`)`. At the end of that bullet append: ` The card reads "Review by X" for a review and "Result from X" otherwise (cards without \`purpose\` included); a clipped card shows "truncated — see the run" and its Inject button reads "Inject (truncated)": Inject puts what the card holds in the composer, never more.`

- [ ] **Step 9: Commit**

```bash
git add lib/agents/events.ts lib/agents/events.test.mjs lib/agents/thread-run.ts lib/agents/thread-run.test.mjs components/agents/AgentEventCard.tsx components/agents/AgentEventCard.test.mjs lib/i18n/messages/en.ts lib/i18n/messages/fr.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts docs/agents/long-term-agents.md
git commit -m "feat(agents): longer delegation cards with a truncation flag, review label and hand-over provenance"
```

- [ ] **Step 10: Manual check (controller, after deployment)**

1. Desktop: Julien → "Ask a review by…" Martin on a long plan → the card in Julien's thread reads "Review by Martin" and shows the whole review (≈4.3k characters, not cut at 2000).
2. Desktop: Julien → "Hand to…" Martin → Martin's thread task card shows "handed over from Julien"; the result card in Julien's thread reads "Result from Martin".
3. Desktop: an older delegation card from before the deploy still renders "Result from X" with no truncation note.
4. Phone 390 px, French UI: the labels read "Relecture par Martin" / "confié depuis le fil de Julien" and wrap without overflow.

---

### Task 3: Push the requester when a hand-over or review ends (B3)

**Files:**
- Modify: `lib/agent-ops/kick.ts:56-71` (`handleTaskEnd`)
- Modify: `lib/web-push.ts:126-142` (`localeText`)
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (append 2 keys)
- Test: `lib/agent-ops/kick.test.mjs` (new test), `lib/web-push.test.mjs` (new test)
- Docs: `docs/agents/agent-ops.md:13`, `docs/agents/long-term-agents.md:108`, `:164`

**Interfaces:**
- Consumes: `appendThreadEvent(agent, data): Promise<string>` (the entry id, `lib/agents/thread.ts:117`); `delegationEventOfTask` from Task 2 (unchanged signature).
- Produces: `localeText(locale, "agentDelegationDone" | "agentDelegationFailed")` → `agents.push.delegationDone` / `agents.push.delegationFailed`, with placeholders `{name}` (executing agent) and `{title}`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/agent-ops/kick.test.mjs`:

```js
test("a delivered card pushes the requester with its entry, on completion and failure, instead of the executing agent's failure push", () => {
  const end = source.slice(source.indexOf("export function handleTaskEnd"), source.indexOf("/** Single runner entry point"));
  assert.match(end, /delivered = \{ to: recipient\.name, entryId: await appendThreadEvent\(recipient, delegation\) \}/);
  const push = end.slice(end.indexOf("if (delivered)"), end.indexOf('if (task.status !== "failed")'));
  assert.ok(push.length > 0, "requester push block found before the failure push");
  assert.match(push, /task\.status === "failed" \? "agentDelegationFailed" : "agentDelegationDone"/);
  assert.match(push, /url: `\/\?agent=\$\{encodeURIComponent\(to\)\}&entry=\$\{encodeURIComponent\(cardId\)\}`/);
  assert.match(push, /tag: `pi-agent:\$\{to\}`/);
  assert.match(push, /\}\)\);\n\s*return;\n\s*\}/); // no second push for a delivered task
  // A card that could not be appended leaves `delivered` unset: the failure push below still fires.
  assert.match(end.slice(end.indexOf('if (task.status !== "failed")')), /url: `\/\?agent=\$\{encodeURIComponent\(agentName\)\}/);
});
```

Append to `lib/web-push.test.mjs`:

```js
test("localeText delegation pushes are localized and fall back to English", () => {
  assert.equal(localeText("ja", "agentDelegationDone"), "{name} answered: {title}");
  assert.equal(localeText("en", "agentDelegationFailed"), "{name}: your request failed ({title})");
  assert.equal(localeText("fr", "agentDelegationFailed"), "{name} : votre demande a échoué ({title})");
  assert.match(localeText("zh-CN", "agentDelegationFailed"), /失败/);
  assert.match(localeText("zh-TW", "agentDelegationDone"), /回覆/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test lib/agent-ops/kick.test.mjs lib/web-push.test.mjs`
Expected: FAIL. There is no `delivered = …`, and `localeText` returns `undefined` for the new keys.

- [ ] **Step 3: Implement `lib/web-push.ts`**

Replace `localeText` (lines 126-142):

```ts
export function localeText(locale: string, key: "sessionComplete" | "taskFinished" | "agentRunFailed" | "agentsDigest" | "agentApprove" | "agentBudget" | "agentNeedsInput" | "agentDelegationDone" | "agentDelegationFailed"): string {
  const id = { sessionComplete: "i18n.sessionComplete", taskFinished: "i18n.taskFinished", agentRunFailed: "agents.push.failed", agentsDigest: "agents.push.digest", agentApprove: "agents.push.approve", agentBudget: "agents.push.budget", agentNeedsInput: "agents.push.needsInput", agentDelegationDone: "agents.push.delegationDone", agentDelegationFailed: "agents.push.delegationFailed" }[key] as keyof typeof enLocale.messages;
  if (locale === "fr") {
    const message = frLocale.messages[id];
    if (message) return message;
  }
  if (locale === "zh-TW") {
    const message = zhTWLocale.messages[id];
    if (message) return message;
  }
  if (locale === "zh-CN") {
    const message = zhCNLocale.messages[id];
    if (message) return message;
  }
  const message = enLocale.messages[id];
  return message ?? { sessionComplete: "Session complete", taskFinished: "Task finished.", agentRunFailed: "{name}: a run failed ({title})", agentsDigest: "Quiet hours: {runs} runs, {failed} failed ({agents})", agentApprove: "{name} asks for approval: {title}", agentBudget: "{name}: daily budget reached ({kind})", agentNeedsInput: "{name} needs your answer", agentDelegationDone: "{name} answered: {title}", agentDelegationFailed: "{name}: your request failed ({title})" }[key];
}
```

- [ ] **Step 4: Implement `lib/agent-ops/kick.ts`**

Update the doc comment at line 39:

```ts
/** After a terminal write: a finished isolated run posts its summary card; a task delivered to another agent posts its delegation card there and pushes that requester (completed or failed); otherwise a failed run of a long-term agent pushes (after the card, so the push can open its entry). Never blocks the runner, never throws. */
```

Replace lines 56-65 (from `if (task.deliverTo) {` through `if (task.status !== "failed") return;`) with:

```ts
    let delivered: { to: string; entryId: string } | undefined;
    if (task.deliverTo) {
      try {
        const recipient = getLongTermAgent(task.deliverTo);
        const delegation = recipient && delegationEventOfTask({ ...task, result: task.result && redactSecrets(task.result), error: task.error && redactSecrets(task.error) });
        if (recipient && delegation) delivered = { to: recipient.name, entryId: await appendThreadEvent(recipient, delegation) }; // a card only: the recipient's model never sees it
      } catch (error) {
        log(error);
      }
    }
    if (delivered) {
      // The requester's thread holds the card: its push replaces the executing agent's failure push. No card, no requester push: the failure push below still fires.
      const { to, entryId: cardId } = delivered;
      await notifyAgent((locale) => ({
        title: to,
        body: localeText(locale, task.status === "failed" ? "agentDelegationFailed" : "agentDelegationDone").replace("{name}", agentName).replace("{title}", task.title),
        url: `/?agent=${encodeURIComponent(to)}&entry=${encodeURIComponent(cardId)}`,
        tag: `pi-agent:${to}`,
      }));
      return;
    }
    if (task.status !== "failed") return;
```

The failure push below (lines 66-71) stays unchanged.

- [ ] **Step 5: i18n (append to each locale)**

`en.ts`:
```ts
    "agents.push.delegationDone": "{name} answered: {title}",
    "agents.push.delegationFailed": "{name}: your request failed ({title})",
```
`fr.ts`:
```ts
    "agents.push.delegationDone": "{name} a répondu : {title}",
    "agents.push.delegationFailed": "{name} : votre demande a échoué ({title})",
```
`zh-CN.ts`:
```ts
    "agents.push.delegationDone": "{name} 已回复：{title}",
    "agents.push.delegationFailed": "{name}：你的请求失败（{title}）",
```
`zh-TW.ts`:
```ts
    "agents.push.delegationDone": "{name} 已回覆：{title}",
    "agents.push.delegationFailed": "{name}：你的請求失敗（{title}）",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test lib/agent-ops/kick.test.mjs lib/web-push.test.mjs lib/i18n/agents-keys.test.mjs lib/i18n/messages.test.mjs`
Expected: PASS. The existing kick tests, which order the card before `notifyAgent(` and keep `prompt` out of the `deliverTo` block, still pass.

- [ ] **Step 7: Document**

- `docs/agents/agent-ops.md` line 13: replace `(existing card → delegation card → failure push; a card only, never a prompt, errors logged)` with `(existing card → delegation card → push; a card only, never a prompt, errors logged). Once that card is appended, the push goes to the requester on completion and on failure: \`agents.push.delegationDone\` / \`agents.push.delegationFailed\` (\`localeText\` keys \`agentDelegationDone\` / \`agentDelegationFailed\`, \`{name}\` = the executing agent), url \`/?agent=<deliverTo>&entry=<card id>\`, tag \`pi-agent:<deliverTo>\`; the executing agent's failure push is skipped. A card that could not be appended (requester gone, thread error) falls back to that failure push`.
- `docs/agents/long-term-agents.md` line 164: replace `\`handleTaskEnd\` pushes only a failed task with \`task.agent\`;` with `\`handleTaskEnd\` pushes a failed task with \`task.agent\` or, once a \`deliverTo\` task's delegation card is appended, the requester instead, completed or failed (agent-ops.md);`.
- `docs/agents/long-term-agents.md` line 108: replace `The failure push of an isolated run uses this url;` with `The failure push of an isolated run and the delegation push to the requester use this url;`.

- [ ] **Step 8: Commit**

```bash
git add lib/agent-ops/kick.ts lib/agent-ops/kick.test.mjs lib/web-push.ts lib/web-push.test.mjs lib/i18n/messages/en.ts lib/i18n/messages/fr.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts docs/agents/agent-ops.md docs/agents/long-term-agents.md
git commit -m "feat(agents): push the requester when a hand-over or review ends"
```

- [ ] **Step 9: Manual check (controller, after deployment)**

1. Phone (installed PWA with push on), app in the background: from Julien, "Ask a review by…" Martin → when it completes, one push "Martin answered: …" titled Julien. Tapping it opens Julien's thread scrolled to the card.
2. Make a review fail (for example pause Martin while it runs, or abort it from the Tasks board) → push "Martin: your request failed (…)" to Julien's card. There is no second push pointing at Martin's thread.
3. Desktop: a plain isolated webhook failure still pushes the agent's own failure push as before.
4. Desktop with French UI subscription: the push text is French.

---

### Task 4: Hand-over dialog: feedback, quote clipping, copy and defaults, `@` hint (A1 + A4 + A5 + A8)

**Files:**
- Create: `components/agents/queue-task-view.ts`, `components/agents/queue-task-view.test.mjs`, `components/ChatWindow.hand-to.test.mjs`
- Modify: `components/agents/QueueTaskDialog.tsx` (whole file, 81 lines)
- Modify: `components/ChatWindow.tsx:1646` (`onQueued`)
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (append 8 keys)
- Test: `components/agents/QueueTaskDialog.test.mjs` (new tests)
- Docs: `docs/agents/long-term-agents.md:178-179`, `AGENTS.md` File Map

**Interfaces:**
- Consumes: the route's `QUOTE_MAX = 20_000` and error strings (Task 1).
- Produces (`components/agents/queue-task-view.ts`, client-safe):
  - `export const QUOTE_MAX = 20_000;`
  - `export function clipQuote(quote: string, max?: number): { text: string; clipped: boolean; kept: number }`
  - `export function reviewExcerpt(quote: string): string` (≤ 60 chars, `""` when none)
  - `export type QueueErrorKey = "agents.handTo.errorQuoteTooLong" | "agents.handTo.errorUnknownAgent" | "agents.tasks.promptTooLong";`
  - `export function queueErrorKey(error: string): QueueErrorKey | null`
  - `QueueTaskDialog` prop `onQueued: (target: string) => void`. Task 6 adds `HandTarget` to this file and changes `targetAgents`. Task 8 extends ChatWindow's `onQueued`.

- [ ] **Step 1: Write the failing tests**

Create `components/agents/queue-task-view.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { clipQuote, QUOTE_MAX, queueErrorKey, reviewExcerpt } = await (await import("jiti")).createJiti(import.meta.url).import("./queue-task-view.ts");
const route = await readFile(new URL("../../app/api/agents/[name]/tasks/route.ts", import.meta.url), "utf8");

test("QUOTE_MAX mirrors the route's cap", () => {
  assert.equal(QUOTE_MAX, 20_000);
  assert.match(route, /const QUOTE_MAX = 20_000;/);
  assert.match(route, /quote\.length > QUOTE_MAX/);
});

test("clipQuote keeps a quote at the cap and cuts a longer one to fit, saying how much", () => {
  assert.deepEqual(clipQuote("abc", 10), { text: "abc", clipped: false, kept: 3 });
  assert.equal(clipQuote("x".repeat(QUOTE_MAX)).clipped, false);
  const long = "y".repeat(25_000);
  const clipped = clipQuote(long);
  assert.equal(clipped.clipped, true);
  assert.ok(clipped.text.length <= QUOTE_MAX, String(clipped.text.length));
  assert.ok(clipped.text.endsWith(`…[truncated, ${clipped.kept} of 25000 characters]`));
  assert.equal(clipped.text.slice(0, clipped.kept), long.slice(0, clipped.kept));
});

test("clipQuote never splits a surrogate pair at the cut", () => {
  for (let pad = 0; pad < 4; pad++) {
    const clipped = clipQuote("a".repeat(pad) + "😀".repeat(15_000));
    assert.ok(clipped.text.length <= QUOTE_MAX, `pad ${pad}`);
    const last = clipped.text.charCodeAt(clipped.kept - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff), `pad ${pad}: lone high surrogate`);
  }
});

test("reviewExcerpt takes the first non-empty line without markdown markers, at most 60 chars", () => {
  assert.equal(reviewExcerpt("\n\n## Plan for the migration\nstep 1"), "Plan for the migration");
  assert.equal(reviewExcerpt("- item one"), "item one");
  assert.equal(reviewExcerpt("> quoted"), "quoted");
  const long = reviewExcerpt("z".repeat(200));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith("…"));
  assert.equal(reviewExcerpt("   \n\n"), "");
});

test("queueErrorKey maps the route's known refusals and leaves the rest raw", () => {
  assert.equal(queueErrorKey("quote must be a string of at most 20000 characters"), "agents.handTo.errorQuoteTooLong");
  assert.equal(queueErrorKey("deliverTo must name an existing agent"), "agents.handTo.errorUnknownAgent");
  assert.equal(queueErrorKey("Agent not found"), "agents.handTo.errorUnknownAgent");
  assert.equal(queueErrorKey("prompt is limited to 20000 characters"), "agents.tasks.promptTooLong");
  assert.equal(queueErrorKey("HTTP 502"), null);
  // The mapping follows the route's wording: a reword must fail here.
  assert.match(route, /`quote must be a string of at most \$\{QUOTE_MAX\} characters`/);
  assert.match(route, /"deliverTo must name an existing agent"/);
  assert.match(route, /"Agent not found"/);
  assert.match(route, /`prompt is limited to \$\{PROMPT_MAX\} characters`/);
});
```

Append to `components/agents/QueueTaskDialog.test.mjs`:

```js
test("onQueued gets the target; errors are red and localized; the quote is clipped to the route cap with a note", () => {
  assert.match(dialog, /onQueued: \(target: string\) => void/);
  assert.match(dialog, /onQueued\(target\);/);
  assert.match(dialog, /const ERROR_COLOR = "#e5484d";/);
  assert.match(dialog, /\{error && <span role="alert" style=\{\{ color: ERROR_COLOR \}\}>/);
  assert.doesNotMatch(dialog, /role="alert" style=\{\{ color: "var\(--text-muted\)" \}\}/);
  assert.match(dialog, /const errorKey = error \? queueErrorKey\(error\) : null;/);
  assert.match(dialog, /quote: sentQuote\.text/);
  assert.doesNotMatch(dialog, /\{ quote \}/);
  assert.match(dialog, /sentQuote\?\.clipped && quote && <span role="note"/);
});

test("the review dialog has its own placeholder, submit label and a Review: first line; a hand-over is prefilled and names the @ shortcut", () => {
  assert.match(dialog, /t\(review \? "agents\.askReview\.placeholder" : "agents\.tasks\.promptPlaceholder"\)/);
  assert.match(dialog, /t\(review \? "agents\.askReview\.submit" : "agents\.tasks\.queue"\)/);
  assert.match(dialog, /\[excerpt \? t\("agents\.askReview\.titleLine", \{ excerpt \}\) : "", t\("agents\.askReview\.prompt"\)\]\.filter\(Boolean\)/);
  assert.match(dialog, /deliverTo \? t\("agents\.handTo\.prompt"\) : ""/);
  assert.match(dialog, /deliverTo && !review && <span[^>]*>\{t\("agents\.handTo\.mentionHint", \{ name: target \}\)\}/);
});

test("the dialog strings exist in all four locales", async () => {
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["agents.handTo.prompt", "agents.askReview.titleLine", "agents.askReview.placeholder", "agents.askReview.submit", "agents.handTo.quoteClipped", "agents.handTo.mentionHint", "agents.handTo.errorQuoteTooLong", "agents.handTo.errorUnknownAgent"]) assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
  }
});
```

Create `components/ChatWindow.hand-to.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("a queued hand-over or review confirms the chosen target with a toast", () => {
  assert.match(chat, /onQueued=\{\(name\) => \{ addNotice\(\{ type: "success", message: t\("agents\.mention\.queued", \{ name \}\) \}\);/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/queue-task-view.test.mjs components/agents/QueueTaskDialog.test.mjs components/ChatWindow.hand-to.test.mjs`
Expected: FAIL. `queue-task-view.ts` does not exist, and the dialog and ChatWindow pins do not match.

- [ ] **Step 3: Create `components/agents/queue-task-view.ts`**

```ts
/** Mirrors QUOTE_MAX in app/api/agents/[name]/tasks/route.ts, counted the same way (quote.length); the route stays authoritative. */
export const QUOTE_MAX = 20_000;
const REVIEW_EXCERPT_MAX = 60;

/** A4: a quote over the route's cap keeps its head and says how much was cut, so the request still goes through. */
export function clipQuote(quote: string, max = QUOTE_MAX): { text: string; clipped: boolean; kept: number } {
  if (quote.length <= max) return { text: quote, clipped: false, kept: quote.length };
  const suffix = (kept: number) => `…[truncated, ${kept} of ${quote.length} characters]`;
  let kept = max - suffix(max).length; // suffix(max) is at least as long as suffix(kept)
  const last = quote.charCodeAt(kept - 1);
  if (last >= 0xd800 && last <= 0xdbff) kept -= 1; // never end on half an emoji
  return { text: quote.slice(0, kept) + suffix(kept), clipped: true, kept };
}

/** A5: the first non-empty line of the quote without markdown markers, for a "Review: …" task title. */
export function reviewExcerpt(quote: string): string {
  const line = quote.split("\n").map((part) => part.replace(/^[\s#>*-]+/, "").trim()).find(Boolean) ?? "";
  return line.length > REVIEW_EXCERPT_MAX ? `${line.slice(0, REVIEW_EXCERPT_MAX - 1)}…` : line;
}

export type QueueErrorKey = "agents.handTo.errorQuoteTooLong" | "agents.handTo.errorUnknownAgent" | "agents.tasks.promptTooLong";

/** A1: the task route's known refusals, localized; anything else is shown as the route wrote it. */
export function queueErrorKey(error: string): QueueErrorKey | null {
  if (error.startsWith("quote must be a string of at most ")) return "agents.handTo.errorQuoteTooLong";
  if (error === "deliverTo must name an existing agent" || error === "Agent not found") return "agents.handTo.errorUnknownAgent";
  if (error.startsWith("prompt is limited to ")) return "agents.tasks.promptTooLong";
  return null;
}
```

- [ ] **Step 4: Rewrite `components/agents/QueueTaskDialog.tsx`**

```tsx
"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import { backdropStyle, buttonStyle, fieldStyle, formStyle, labelStyle } from "./dialog-styles";
import { clipQuote, QUOTE_MAX, queueErrorKey, reviewExcerpt } from "./queue-task-view";

const REVIEW_TOOLS = ["read", "grep", "find", "ls", "memory_search"];
// Mirrors PROMPT_MAX in app/api/agents/[name]/tasks/route.ts, counted the same way (prompt.length); the route stays authoritative.
const PROMPT_MAX = 20_000;
const ERROR_COLOR = "#e5484d";

/** `targetAgents`, `quote` and `deliverTo` make it a hand-over (D14): the result comes back as a card in `deliverTo`'s thread.
 *  `purpose="review"` queues an isolated read-only review run instead of a thread task. `onQueued` receives the agent the task went to. */
export function QueueTaskDialog({ agentName, targetAgents, quote, deliverTo, purpose = "handoff", onClose, onQueued }: { agentName: string; targetAgents?: string[]; quote?: string; deliverTo?: string; purpose?: "handoff" | "review"; onClose: () => void; onQueued: (target: string) => void }) {
  const { t, locale } = useI18n();
  const review = purpose === "review";
  const sentQuote = useMemo(() => (quote ? clipQuote(quote) : null), [quote]);
  const [prompt, setPrompt] = useState(() => {
    if (!review) return deliverTo ? t("agents.handTo.prompt") : "";
    const excerpt = quote ? reviewExcerpt(quote) : "";
    return [excerpt ? t("agents.askReview.titleLine", { excerpt }) : "", t("agents.askReview.prompt")].filter(Boolean).join("\n\n");
  });
  const [target, setTarget] = useState(agentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lengthId = useId();
  const overCap = prompt.length > PROMPT_MAX;
  const showLength = prompt.length > PROMPT_MAX / 2;
  const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
  const errorKey = error ? queueErrorKey(error) : null;

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(target)}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deliverTo ? { prompt, requestedBy: "user", deliverTo, ...(sentQuote ? { quote: sentQuote.text } : {}), ...(review ? { target: "isolated", kind: "review", tools: REVIEW_TOOLS, purpose } : {}) } : { prompt }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(data.error ?? `HTTP ${response.status}`); return; }
      onQueued(target);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const title = t(review ? "agents.askReview.dialogTitle" : deliverTo ? "agents.handTo.dialogTitle" : "agents.tasks.queueTitle", { name: target });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        {targetAgents && targetAgents.length > 1 && (
          <label style={labelStyle}>
            {t("agents.handTo.target")}
            <select value={target} onChange={(event) => setTarget(event.target.value)} style={fieldStyle}>
              {targetAgents.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {sentQuote && (
          <details style={{ fontSize: 12, color: "var(--text-muted)" }}>
            <summary style={{ cursor: "pointer" }}>{t(review ? "agents.askReview.quote" : "agents.handTo.quote")}</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflow: "auto", margin: "4px 0 0" }}>{sentQuote.text}</pre>
          </details>
        )}
        {sentQuote?.clipped && quote && <span role="note" style={{ fontSize: 12, color: "var(--text)" }}>{t("agents.handTo.quoteClipped", { count: formatCount(quote.length), kept: formatCount(sentQuote.kept) })}</span>}
        <label style={labelStyle}>
          {t("agents.tasks.prompt")}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t(review ? "agents.askReview.placeholder" : "agents.tasks.promptPlaceholder")} rows={6} required aria-describedby={showLength ? lengthId : undefined} aria-invalid={overCap || undefined} style={{ ...fieldStyle, resize: "vertical" }} />
          {error && <span role="alert" style={{ color: ERROR_COLOR }}>{errorKey ? t(errorKey, { max: formatCount(errorKey === "agents.tasks.promptTooLong" ? PROMPT_MAX : QUOTE_MAX) }) : t("agents.error", { error })}</span>}
        </label>
        {showLength && <span id={lengthId} style={{ justifySelf: "end", marginTop: -6, fontSize: 12, fontVariantNumeric: "tabular-nums", color: overCap ? "var(--text)" : "var(--text-muted)", fontWeight: overCap ? 600 : undefined }}>{t("agents.tasks.promptLength", { count: formatCount(prompt.length), max: formatCount(PROMPT_MAX) })}</span>}
        {overCap && <span role="alert" style={{ fontSize: 12, color: "var(--text)" }}>{t("agents.tasks.promptTooLong", { max: formatCount(PROMPT_MAX) })}</span>}
        {deliverTo && !review && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agents.handTo.mentionHint", { name: target })}</span>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !prompt.trim() || overCap} style={{ ...buttonStyle, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}>{t(review ? "agents.askReview.submit" : "agents.tasks.queue")}</button>
        </div>
      </form>
    </div>
  );
}
```

`AgentSpaceRight.tsx:202` passes `onQueued={reloadMemory}` (`() => void`). That is still assignable, so leave it.

- [ ] **Step 5: `components/ChatWindow.tsx:1646`**

Replace `onQueued={() => setHandQuote(null)}` with:

```tsx
onQueued={(name) => { addNotice({ type: "success", message: t("agents.mention.queued", { name }) }); setHandQuote(null); }}
```

- [ ] **Step 6: i18n (append to each locale)**

`en.ts`:
```ts
    "agents.handTo.prompt": "Take over from here: continue this work.",
    "agents.askReview.titleLine": "Review: {excerpt}",
    "agents.askReview.placeholder": "What should the reviewer look at? The review runs isolated with read-only tools, and its findings come back here.",
    "agents.askReview.submit": "Ask for review",
    "agents.handTo.quoteClipped": "This message is {count} characters long: only the first {kept} are handed over.",
    "agents.handTo.mentionHint": "Shortcut: start a composer message with @{name} followed by the task to hand it over without this dialog.",
    "agents.handTo.errorQuoteTooLong": "The handed-over message is too long (at most {max} characters).",
    "agents.handTo.errorUnknownAgent": "That agent no longer exists. Close this dialog and pick another one.",
```
`fr.ts`:
```ts
    "agents.handTo.prompt": "Reprenez à partir d'ici : poursuivez ce travail.",
    "agents.askReview.titleLine": "Relecture : {excerpt}",
    "agents.askReview.placeholder": "Sur quoi doit porter la relecture ? Elle s'exécute isolée, avec des outils en lecture seule, et ses constats reviennent ici.",
    "agents.askReview.submit": "Demander la relecture",
    "agents.handTo.quoteClipped": "Ce message fait {count} caractères : seuls les {kept} premiers sont transmis.",
    "agents.handTo.mentionHint": "Raccourci : commencez un message par @{name} suivi de la tâche pour la confier sans cette fenêtre.",
    "agents.handTo.errorQuoteTooLong": "Le message confié est trop long ({max} caractères au maximum).",
    "agents.handTo.errorUnknownAgent": "Cet agent n'existe plus. Fermez cette fenêtre et choisissez-en un autre.",
```
`zh-CN.ts`:
```ts
    "agents.handTo.prompt": "从这里接手：继续这项工作。",
    "agents.askReview.titleLine": "审阅：{excerpt}",
    "agents.askReview.placeholder": "审阅者应关注什么？审阅在隔离环境中以只读工具运行，结果会返回到这里。",
    "agents.askReview.submit": "请求审阅",
    "agents.handTo.quoteClipped": "此消息共 {count} 个字符：只会移交前 {kept} 个。",
    "agents.handTo.mentionHint": "快捷方式：在输入框中以 @{name} 开头并写上任务，即可不经此对话框直接移交。",
    "agents.handTo.errorQuoteTooLong": "移交的消息过长（最多 {max} 个字符）。",
    "agents.handTo.errorUnknownAgent": "该智能体已不存在。请关闭此对话框并选择其他智能体。",
```
`zh-TW.ts`:
```ts
    "agents.handTo.prompt": "從這裡接手：繼續這項工作。",
    "agents.askReview.titleLine": "審閱：{excerpt}",
    "agents.askReview.placeholder": "審閱者應關注什麼？審閱在隔離環境中以唯讀工具執行，結果會回到這裡。",
    "agents.askReview.submit": "請求審閱",
    "agents.handTo.quoteClipped": "此訊息共 {count} 個字元：只會移交前 {kept} 個。",
    "agents.handTo.mentionHint": "捷徑：在輸入框中以 @{name} 開頭並寫上任務，即可不經此對話框直接移交。",
    "agents.handTo.errorQuoteTooLong": "移交的訊息過長（最多 {max} 個字元）。",
    "agents.handTo.errorUnknownAgent": "該代理已不存在。請關閉此對話框並選擇其他代理。",
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/queue-task-view.test.mjs components/agents/QueueTaskDialog.test.mjs components/ChatWindow.hand-to.test.mjs components/agents/AgentSpace.test.mjs lib/i18n/agents-keys.test.mjs lib/i18n/messages.test.mjs`
Expected: PASS. The existing counter and `PROMPT_MAX` tests keep passing.

- [ ] **Step 8: Document**

- `docs/agents/long-term-agents.md` line 178: append at the end of the bullet: ` \`QueueTaskDialog\` cuts a quote over \`QUOTE_MAX\` (mirrored in \`components/agents/queue-task-view.ts\`, pinned equal by its test) to its head plus \`…[truncated, X of Y characters]\` (never mid surrogate pair) and says so. A hand-over is prefilled "Take over from here: continue this work." (editable) and the dialog names the \`@Name\` shortcut. On 2xx a toast "Queued for X" names the target; a refusal shows in red, with the known ones (quote too long, unknown agent, prompt too long) localized by \`queueErrorKey\` and others shown raw.`
- Line 179: replace `(prompt prefilled "Please review this.", editable; quote read-only)` with `(prompt prefilled "Review: <first line of the quote, ≤ 60 chars>" then "Please review this.", editable, so the task title says what is reviewed; its own placeholder and "Ask for review" button; quote read-only)`.
- `AGENTS.md` File Map, under `components/`, after the `agents/QueueTaskDialog.tsx` line add:
  ```
    agents/queue-task-view.ts QUOTE_MAX mirror, clipQuote, reviewExcerpt, queueErrorKey, HandTarget: pure helpers of QueueTaskDialog (client-safe)
  ```

- [ ] **Step 9: Commit**

```bash
git add components/agents/queue-task-view.ts components/agents/queue-task-view.test.mjs components/agents/QueueTaskDialog.tsx components/agents/QueueTaskDialog.test.mjs components/ChatWindow.tsx components/ChatWindow.hand-to.test.mjs lib/i18n/messages/en.ts lib/i18n/messages/fr.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts docs/agents/long-term-agents.md AGENTS.md
git commit -m "fix(agents): hand-over dialog feedback, quote clipping and review copy"
```

(Check `git diff --cached AGENTS.md` first: only your File Map line, no `BEGIN:nextjs-agent-rules` block.)

- [ ] **Step 10: Manual check (controller, after deployment)**

1. Desktop: "Hand to…" on a short message → the prompt is prefilled "Take over from here…" and the `@Martin` hint shows. Submit → toast "Queued for Martin" and the dialog closes.
2. Desktop: "Hand to…" on a message over 20 000 characters (paste one into a thread first) → the note says how many characters are sent, and the expanded quote ends in `…[truncated, …]`. Submit is accepted.
3. Desktop: "Ask a review by…" → the first line reads "Review: <first line of the message>", the placeholder mentions the isolated read-only review, and the button says "Ask for review". The Tasks board title shows "Review: …".
4. Desktop: delete Martin in another tab, then submit from an open dialog → a red localized "That agent no longer exists…" message, not raw English.
5. Phone 390 px, keyboard open in the textarea: the error, note and hint stay readable and the dialog scrolls.

---

### Task 5: Message actions reachable on touch and keyboard (A2)

**Files:**
- Modify: `components/MessageView.tsx:6` / `:12` (imports), `:753` (state), `:873-879` (wrapper), `:1018-1019`, `:1047-1048`, `:1066-1067` (three `opacity` / `pointerEvents` pairs in `AssistantMessageView`)
- Test: `components/MessageView.test.mjs` (new tests)
- Docs: `docs/agents/long-term-agents.md:178`

**Interfaces:**
- Consumes: `useIsCoarsePointer()`, `useIsMobile()` from `hooks/useIsMobile.ts` (existing).
- Produces: no prop change to `MessageView` (Global Constraint 6). State is internal to `AssistantMessageView`.

- [ ] **Step 1: Write the failing tests**

In `components/MessageView.test.mjs`, add after line 3 (`import { createJiti } from "jiti";`):

```js
import { readFileSync } from "node:fs";
```

Append:

```js
test("assistant actions show on hover, focus inside the message, touch screens and phones; no new MessageView prop", () => {
  const source = readFileSync(new URL("./MessageView.tsx", import.meta.url), "utf8");
  const assistant = source.slice(source.indexOf("function AssistantMessageView"), source.indexOf("function BlockView"));
  assert.match(assistant, /const actionsVisible = hovered \|\| focusInside \|\| touchFirst \|\| isMobile;/);
  assert.match(assistant, /onFocus=\{\(\) => setFocusInside\(true\)\}/);
  assert.match(assistant, /onBlur=\{\(event\) => \{ if \(!event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)\) setFocusInside\(false\); \}\}/);
  assert.equal(assistant.match(/opacity: actionsVisible \? 1 : 0,\s*pointerEvents: actionsVisible \? "auto" : "none",/g)?.length, 3);
  assert.doesNotMatch(assistant, /opacity: hovered \? 1 : 0/);
});

test("a finished assistant message renders Copy, Hand to and Ask a review buttons", () => {
  const html = renderMessage({ role: "assistant", provider: "openai", model: "gpt-test", content: [{ type: "text", text: "Plan" }] }, { onHandTo: () => {}, onAskReview: () => {} });
  assert.match(html, />Hand to…</);
  assert.match(html, />Ask a review by…</);
  assert.match(html, /title="Copy message"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/MessageView.test.mjs`
Expected: FAIL on the first new test (`actionsVisible` missing). The render test passes already; it guards against the buttons disappearing.

- [ ] **Step 3: Implement**

Imports, after line 12 (`import { useI18n } from "@/hooks/useI18n";`):

```ts
import { useIsCoarsePointer, useIsMobile } from "@/hooks/useIsMobile";
```

After line 753 (`const [hovered, setHovered] = useState(false);` inside `AssistantMessageView`):

```ts
  const [focusInside, setFocusInside] = useState(false);
  const touchFirst = useIsCoarsePointer();
  const isMobile = useIsMobile();
  // Touch screens never hover, and a keyboard user must see the button Tab reached.
  const actionsVisible = hovered || focusInside || touchFirst || isMobile;
```

Wrapper at lines 873-879. After `onMouseLeave={() => setHovered(false)}` add:

```tsx
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false); }}
```

In the three buttons (Copy at 1018-1019, Hand to at 1047-1048, Ask a review at 1066-1067), replace each

```ts
              opacity: hovered ? 1 : 0,
              pointerEvents: hovered ? "auto" : "none",
```

with

```ts
              opacity: actionsVisible ? 1 : 0,
              pointerEvents: actionsVisible ? "auto" : "none",
```

(The user-message pairs at 571-572 and 608-609 are not in scope; leave them.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/MessageView.test.mjs hooks/useAgentSession.agent-events.test.mjs`
Expected: PASS.

- [ ] **Step 5: Document**

`docs/agents/long-term-agents.md` line 178: replace `"Hand to…" (hover action on an assistant message of a trusted agent thread, hidden without another agent)` with `"Hand to…" (action on an assistant message of a trusted agent thread, hidden without another agent; like Copy and "Ask a review by…" it shows on hover, while focus is inside the message, and always on touch screens (\`pointer: coarse\`) and phones (≤ 640 px))`.

- [ ] **Step 6: Commit**

```bash
git add components/MessageView.tsx components/MessageView.test.mjs docs/agents/long-term-agents.md
git commit -m "fix(agents): message actions reachable on touch and keyboard"
```

- [ ] **Step 7: Manual check (controller, after deployment)**

1. Phone (iOS Safari or PWA): in Julien's thread, every finished assistant message shows Copy / Hand to… / Ask a review by… without a tap first. One tap on "Hand to…" opens the dialog.
2. Desktop, keyboard only: Tab into an assistant message → the buttons appear as soon as one gets focus, the focus ring is visible, and Enter opens the dialog. Tab out of the message → they hide again.
3. Desktop mouse: the hover behaviour is unchanged (hidden until hover).
4. Desktop: stream a long reply → no visible jank, and the buttons appear only once the message is finished.

---

### Task 6: Target selector always shown, with status and self hint (A3)

**Files:**
- Modify: `components/agents/queue-task-view.ts` (add `HandTarget`)
- Modify: `components/agents/QueueTaskDialog.tsx` (prop type, select block)
- Modify: `components/ChatWindow.tsx:65-66` (prop), `:472` (`handTargets`), `:1018-1019` (mention), `:1646` (`agentName`)
- Modify: `components/AppShell.tsx:199`
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (append 3 keys)
- Test: `components/agents/QueueTaskDialog.test.mjs`, `components/ChatWindow.hand-to.test.mjs`
- Docs: `docs/agents/long-term-agents.md:178`

**Interfaces:**
- Consumes: `AgentListItem` (`lib/agents/agent-view.ts:5`); Task 4's dialog.
- Produces: `export type HandTarget = Pick<AgentListItem, "name" | "paused" | "running">;` in `queue-task-view.ts`. `QueueTaskDialog` `targetAgents?: HandTarget[]`. `ChatWindow` `handToAgents?: HandTarget[]`. `ChatInput` keeps `mentionAgents?: string[]`.

- [ ] **Step 1: Write the failing tests**

Append to `components/agents/QueueTaskDialog.test.mjs`:

```js
test("the target select always shows, marks paused and busy agents, and explains the missing self", () => {
  assert.match(dialog, /targetAgents\?: HandTarget\[\]/);
  assert.match(dialog, /\{targetAgents && \(/);
  assert.doesNotMatch(dialog, /targetAgents\.length > 1/);
  assert.match(dialog, /agent\.paused \? `\$\{agent\.name\} \$\{t\("agents\.handTo\.paused"\)\}` : agent\.running \? `\$\{agent\.name\} \$\{t\("agents\.handTo\.busy"\)\}` : agent\.name/);
  assert.match(dialog, /aria-describedby=\{deliverTo \? selfHintId : undefined\}/);
  assert.match(dialog, /<span id=\{selfHintId\}[^>]*>\{t\("agents\.handTo\.selfHint", \{ name: deliverTo \}\)\}/);
  for (const key of ["agents.handTo.selfHint", "agents.handTo.paused", "agents.handTo.busy"]) assert.ok(dialog.includes(`"${key}"`), key);
});
```

Append to `components/ChatWindow.hand-to.test.mjs`:

```js
const shell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("hand-over targets carry paused and running from the rail poll; the composer mention keeps names", () => {
  assert.match(shell, /const handToAgents = useMemo\(\(\) => agents\.map\(\(\{ name, paused, running \}\) => \(\{ name, paused, running \}\)\), \[agents\]\);/);
  assert.match(chat, /handToAgents\?: HandTarget\[\];/);
  assert.match(chat, /\.filter\(\(agent\) => agent\.name !== trustedAgentName\)/);
  assert.match(chat, /const mentionTargets = useMemo\(\(\) => handTargets\.map\(\(agent\) => agent\.name\), \[handTargets\]\);/);
  assert.match(chat, /mentionAgents=\{mentionTargets\.length > 0 \? mentionTargets : undefined\}/);
  assert.match(chat, /<QueueTaskDialog agentName=\{handTargets\[0\]\.name\} targetAgents=\{handTargets\}/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/QueueTaskDialog.test.mjs components/ChatWindow.hand-to.test.mjs`
Expected: FAIL. The dialog still has the `length > 1` gate, and `handToAgents` is names only.

- [ ] **Step 3: Implement**

`components/agents/queue-task-view.ts`, at the top of the file:

```ts
import type { AgentListItem } from "@/lib/agents/agent-view";

/** A3: a hand-over target with the status the rail poll already has. */
export type HandTarget = Pick<AgentListItem, "name" | "paused" | "running">;
```

`components/agents/QueueTaskDialog.tsx`:
- The import becomes `import { clipQuote, type HandTarget, QUOTE_MAX, queueErrorKey, reviewExcerpt } from "./queue-task-view";`
- In the props type, change `targetAgents?: string[]` to `targetAgents?: HandTarget[]`.
- After `const lengthId = useId();` add `const selfHintId = useId();`.
- Replace the block `{targetAgents && targetAgents.length > 1 && ( … )}` with:

```tsx
        {targetAgents && (
          <label style={labelStyle}>
            {t("agents.handTo.target")}
            <select value={target} onChange={(event) => setTarget(event.target.value)} aria-describedby={deliverTo ? selfHintId : undefined} style={fieldStyle}>
              {targetAgents.map((agent) => <option key={agent.name} value={agent.name}>{agent.paused ? `${agent.name} ${t("agents.handTo.paused")}` : agent.running ? `${agent.name} ${t("agents.handTo.busy")}` : agent.name}</option>)}
            </select>
          </label>
        )}
        {targetAgents && deliverTo && <span id={selfHintId} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -6 }}>{t("agents.handTo.selfHint", { name: deliverTo })}</span>}
```

(The hint sits outside the `<label>` so it is not part of the select's accessible name; `aria-describedby` reads it.)

`components/AppShell.tsx:199`:

```ts
  const handToAgents = useMemo(() => agents.map(({ name, paused, running }) => ({ name, paused, running })), [agents]);
```

`components/ChatWindow.tsx`:
- Imports, after line 4 (`import { QueueTaskDialog } from "./agents/QueueTaskDialog";`): `import type { HandTarget } from "./agents/queue-task-view";`
- Lines 65-66:
  ```ts
  /** Every long-term agent with its rail status: the "Hand to…" targets of a trusted agent thread (its own name is left out). */
  handToAgents?: HandTarget[];
  ```
- Line 472:
  ```ts
  const handTargets = useMemo(() => (trustedAgentName ? (handToAgents ?? []).filter((agent) => agent.name !== trustedAgentName) : []), [trustedAgentName, handToAgents]);
  const mentionTargets = useMemo(() => handTargets.map((agent) => agent.name), [handTargets]);
  ```
- Lines 1018-1019:
  ```tsx
      mentionAgents={mentionTargets.length > 0 ? mentionTargets : undefined}
      onQueueMention={mentionTargets.length > 0 ? queueMention : undefined}
  ```
- Line 1646: `agentName={handTargets[0]}` becomes `agentName={handTargets[0].name}` (`targetAgents={handTargets}` stays).

Lines 1237-1238 (`handTargets.length > 0 ? handTo : undefined`) are unchanged: `handTo` / `askReview` stay stable `useCallback`s, so `MessageView`'s memo is unaffected.

- [ ] **Step 4: i18n (append to each locale)**

`en.ts`:
```ts
    "agents.handTo.selfHint": "{name} is not listed: an agent cannot hand work to itself.",
    "agents.handTo.paused": "(paused — will wait)",
    "agents.handTo.busy": "(busy — queued)",
```
`fr.ts`:
```ts
    "agents.handTo.selfHint": "{name} n'apparaît pas : un agent ne peut pas se confier du travail à lui-même.",
    "agents.handTo.paused": "(en pause — attendra)",
    "agents.handTo.busy": "(occupé — mis en file)",
```
`zh-CN.ts`:
```ts
    "agents.handTo.selfHint": "列表中没有 {name}：智能体不能把工作交给自己。",
    "agents.handTo.paused": "（已暂停——将等待）",
    "agents.handTo.busy": "（忙碌——已排队）",
```
`zh-TW.ts`:
```ts
    "agents.handTo.selfHint": "清單中沒有 {name}：代理不能把工作交給自己。",
    "agents.handTo.paused": "（已暫停——將等待）",
    "agents.handTo.busy": "（忙碌——已排隊）",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/QueueTaskDialog.test.mjs components/ChatWindow.hand-to.test.mjs components/agents/queue-task-view.test.mjs lib/i18n/agents-keys.test.mjs lib/i18n/messages.test.mjs components/AppShell.open-agent.test.mjs components/ChatInput.test.mjs`
Expected: PASS. Then run `node_modules/.bin/tsc --noEmit` to catch any other `handToAgents` / `targetAgents` consumer (at `bad64e6`, `rg -n "handToAgents|targetAgents" components app hooks` lists only the files above).

- [ ] **Step 6: Document**

`docs/agents/long-term-agents.md` line 178: append at the end of the bullet: ` The target \`<select>\` always shows (a single candidate included). Each option is marked "(paused — will wait)" or "(busy — queued)" from the rail poll (\`AppShell\` passes \`{ name, paused, running }\`), and a hint says the thread's own agent is not listed because an agent cannot hand work to itself.`

- [ ] **Step 7: Commit**

```bash
git add components/agents/queue-task-view.ts components/agents/QueueTaskDialog.tsx components/agents/QueueTaskDialog.test.mjs components/ChatWindow.tsx components/ChatWindow.hand-to.test.mjs components/AppShell.tsx lib/i18n/messages/en.ts lib/i18n/messages/fr.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts docs/agents/long-term-agents.md
git commit -m "feat(agents): always show the hand-over target with its status"
```

- [ ] **Step 8: Manual check (controller, after deployment)**

1. Desktop with exactly two agents (Julien, Martin): "Hand to…" from Julien → a select with "Martin" and the hint "Julien is not listed: an agent cannot hand work to itself."
2. Desktop: pause Martin from the rail and reopen the dialog → the option reads "Martin (paused — will wait)". Start a turn in Martin's thread → within 5 s the option reads "Martin (busy — queued)".
3. Desktop: the composer `@Martin do X` still queues (mention autocomplete lists Martin).
4. Phone 390 px: the select opens the native picker with the status labels, and the hint wraps.

---

### Task 7: Delegation result rendered as collapsible markdown (A6)

**Files:**
- Modify: `components/agents/AgentEventCard.tsx` (imports, hooks at the top, delegation summary)
- Modify: `app/globals.css` (after line 2086, `.agent-event-summary`)
- Test: `components/agents/AgentEventCard.test.mjs` (from Task 2, new tests), `hooks/useAgentSession.agent-events.test.mjs:19-23` (update)
- Docs: `docs/agents/long-term-agents.md:180`

**Interfaces:**
- Consumes: `MarkdownBody({ children, className?, isStreaming?, cwd?, onOpenFile?, keepLineBreaks? })` (`components/MarkdownBody.tsx:47`); Task 2's delegation branch and test helpers (`render`, `done`).
- Produces: nothing used later.

- [ ] **Step 1: Write the failing tests**

`hooks/useAgentSession.agent-events.test.mjs`: replace the test at lines 19-23 with:

```js
test("a webhook summary stays plain pre-wrapped text; a delegation summary is display-only markdown that folds when long", () => {
  const source = read("../components/agents/AgentEventCard.tsx");
  assert.match(source, /whiteSpace: "pre-wrap"/);
  assert.match(source, /<MarkdownBody>\{data\.summary\}<\/MarkdownBody>/);
  assert.doesNotMatch(source, /onOpenFile|ReactMarkdown|cwd=/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{summaryId\}/);
});
```

Append to `components/agents/AgentEventCard.test.mjs`:

```js
test("a delegation summary renders as markdown; a long one folds behind an Expand toggle", () => {
  const short = render(ev.delegationEventOfTask({ ...done, result: "**bold** finding" }));
  assert.match(short, /<strong>bold<\/strong>/);
  assert.doesNotMatch(short, /aria-expanded/);
  const long = render(ev.delegationEventOfTask({ ...done, result: Array.from({ length: 40 }, (_, i) => `- finding ${i}`).join("\n") }));
  assert.match(long, /class="agent-event-summary is-collapsed"/);
  assert.match(long, /aria-expanded="false"/);
  assert.match(long, />Expand</);
});

test("a webhook summary stays raw text", () => {
  assert.match(render(ev.buildWebhookEvent({ taskId: "w", triggerId: "g", title: "alert", status: "completed", summary: "**raw**" })), /\*\*raw\*\*/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/AgentEventCard.test.mjs hooks/useAgentSession.agent-events.test.mjs`
Expected: FAIL. The summary is pre-wrapped text, with no `<strong>` and no toggle.

- [ ] **Step 3: Implement `components/agents/AgentEventCard.tsx`**

Imports, line 2 becomes `import { useId, useState } from "react";`. After line 7 add:

```ts
import { MarkdownBody } from "../MarkdownBody";

// A longer result folds to a fixed height; the toggle shows the rest.
const SUMMARY_FOLD_CHARS = 1200;
const SUMMARY_FOLD_LINES = 16;
```

After `const [retryState, setRetryState] = …` (before `const data = …`, so the hook order never depends on the data):

```ts
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
```

In the delegation branch, before `return (`, add:

```ts
    const foldable = data.summary.length > SUMMARY_FOLD_CHARS || data.summary.split("\n").length > SUMMARY_FOLD_LINES;
```

and replace

```tsx
        <div className="agent-event-summary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{data.summary}</div>
```

(the delegation one, directly after the `agent-event-head` div; the webhook one at the bottom stays) with

```tsx
        {/* Display-only (D14): no cwd, no onOpenFile, so a link never opens a file in the app. */}
        <div id={summaryId} className={foldable && !expanded ? "agent-event-summary is-collapsed" : "agent-event-summary"}><MarkdownBody>{data.summary}</MarkdownBody></div>
        {foldable && <button type="button" className="agent-event-toggle" aria-expanded={expanded} aria-controls={summaryId} onClick={() => setExpanded((open) => !open)}>{t(expanded ? "i18n.collapse" : "i18n.expand")}</button>}
```

(`i18n.expand` / `i18n.collapse` exist in all four locales: no new key.)

- [ ] **Step 4: CSS, `app/globals.css`, after line 2086 (`.agent-event-summary { … }`)**

```css
.agent-event-summary .markdown-body { font-size: inherit; }
.agent-event-summary.is-collapsed { max-height: 16em; overflow: hidden; }
.agent-event-toggle { margin-top: 4px; padding: 2px 0; border: none; background: none; color: var(--accent); font-size: 11px; cursor: pointer; }
.agent-event-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/AgentEventCard.test.mjs hooks/useAgentSession.agent-events.test.mjs components/MessageView.test.mjs app/reduced-motion.test.mjs`
Expected: PASS.

- [ ] **Step 6: Document**

`docs/agents/long-term-agents.md` line 180: append at the end of the bullet: ` The delegation summary renders through \`MarkdownBody\` without \`cwd\` or \`onOpenFile\` (display-only: links open in a new tab, never a file in the app; markdown images load like in any assistant message) and folds past 1200 characters or 16 lines behind an Expand / Collapse toggle (\`aria-expanded\`). Webhook summaries stay plain text.`

- [ ] **Step 7: Commit**

```bash
git add components/agents/AgentEventCard.tsx components/agents/AgentEventCard.test.mjs hooks/useAgentSession.agent-events.test.mjs app/globals.css docs/agents/long-term-agents.md
git commit -m "feat(agents): render delegation results as collapsible markdown"
```

- [ ] **Step 8: Manual check (controller, after deployment)**

1. Desktop: the live review card (bold text, a table, a code fence) renders formatted, folded to about 16 lines, with an "Expand" button. Expand shows everything and Collapse folds it back.
2. Desktop keyboard: Tab reaches Expand with a visible focus ring, and Enter toggles it. A screen reader announces expanded / collapsed.
3. Desktop: a link in the card opens in a new tab; a path-like link does not open the file viewer.
4. Phone 390 px: the table scrolls horizontally inside the card, and the folded card does not push the composer off-screen.

---

### Task 8: Pending requests strip in the requester thread (A7)

**Files:**
- Modify: `components/agents/task-view.ts` (add `outgoingRequests` after `isActiveTask`, line 7)
- Create: `components/agents/PendingRequests.tsx`, `components/agents/PendingRequests.test.mjs`
- Modify: `components/ChatWindow.tsx` (import; state beside `handQuote`, line 473; `queueMention` success, line 465; strip before `PromptChips`, line 1643; `onQueued`, line 1646)
- Modify: `app/globals.css` (strip styles after the Task 7 rules; keyboard-open rule after line 2062)
- Modify: `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts` (append 4 keys)
- Test: `components/agents/task-view.test.mjs`, `components/ChatWindow.hand-to.test.mjs`
- Docs: `docs/agents/long-term-agents.md` (new bullet after line 182, "The user injects by hand"), `docs/agents/client-platform.md` (keyboard-open height budget), `AGENTS.md` File Map

**Interfaces:**
- Consumes: `GET /api/agent-ops/tasks` → `{ tasks: AgentTaskListItem[]; truncated?: true }` (every queued/running task is always included, `lib/agent-ops/task-list.ts:15`); `DELETE /api/agent-ops/tasks/[id]`; `requestTaskAction(url, init): Promise<string | null>` and `formatTaskDuration(task, now?)` from `task-view.ts`.
- Produces: `export function outgoingRequests<T extends Pick<AgentTaskListItem, "deliverTo" | "status" | "createdAt">>(tasks: readonly T[], requester: string): T[]`; `PendingRequests({ agentName: string; refreshKey: number })`.

- [ ] **Step 1: Write the failing tests**

`components/agents/task-view.test.mjs` line 3: add `outgoingRequests` to the destructured import:

```js
const { formatTaskDuration, isActiveTask, outgoingRequests } = await (await import("jiti")).createJiti(import.meta.url).import("./task-view.ts");
```

Append:

```js
test("outgoingRequests keeps the requester's queued and running tasks, oldest first", () => {
  const tasks = [
    { id: "a", deliverTo: "Julien", status: "running", createdAt: "2026-01-01T00:02:00.000Z" },
    { id: "b", deliverTo: "Julien", status: "queued", createdAt: "2026-01-01T00:01:00.000Z" },
    { id: "c", deliverTo: "Julien", status: "completed", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "d", deliverTo: "Julien", status: "cancelled", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "e", deliverTo: "Martin", status: "queued", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "f", status: "queued", createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  assert.deepEqual(outgoingRequests(tasks, "Julien").map((task) => task.id), ["b", "a"]);
  assert.deepEqual(outgoingRequests(tasks, "Nobody"), []);
});
```

Create `components/agents/PendingRequests.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./PendingRequests.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

test("the strip polls only while the tab is visible and stops when it hides", () => {
  assert.match(source, /if \(document\.visibilityState !== "visible"\) return;/);
  assert.match(source, /document\.addEventListener\("visibilitychange", sync\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", sync\)/);
  assert.match(source, /clearInterval\(timer\);\n\s*timer = undefined;/);
  assert.match(source, /fetch\("\/api\/agent-ops\/tasks", \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(source, /outgoingRequests\(data\.tasks, agentName\)/);
});

test("a row cancels through DELETE, says what it waits on, and an empty list renders nothing", () => {
  assert.match(source, /requestTaskAction\(`\/api\/agent-ops\/tasks\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(source, /t\(task\.status === "running" \? "agents\.pending\.running" : "agents\.pending\.queued", \{ name: task\.agent \?\? "\?", age: formatTaskDuration\(task\) \}\)/);
  assert.match(source, /aria-label=\{t\("agents\.pending\.cancel", \{ title: task\.title \}\)\}/);
  assert.match(source, /if \(tasks\.length === 0\) return null;/);
  assert.match(source, /role="region" aria-label=\{t\("agents\.pending\.label"\)\}/);
});

test("the strip yields its height to the phone keyboard", () => {
  assert.match(css, /@media \(max-width: 640px\), \(pointer: coarse\) and \(max-height: 500px\) \{\s*html\[data-keyboard-open\] \.agent-pending-strip \{ display: none; \}/);
});
```

Append to `components/ChatWindow.hand-to.test.mjs`:

```js
test("a trusted thread shows the pending strip, refreshed at once after a queue", () => {
  assert.match(chat, /import \{ PendingRequests \} from "\.\/agents\/PendingRequests";/);
  assert.match(chat, /\{trustedAgentName \? <PendingRequests agentName=\{trustedAgentName\} refreshKey=\{pendingRefresh\} \/> : null\}/);
  assert.equal(chat.match(/setPendingRefresh\(\(tick\) => tick \+ 1\)/g)?.length, 2); // dialog and @Name
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/task-view.test.mjs components/agents/PendingRequests.test.mjs components/ChatWindow.hand-to.test.mjs`
Expected: FAIL. `outgoingRequests` is not a function, `PendingRequests.tsx` is missing, and so is the CSS rule.

- [ ] **Step 3: `components/agents/task-view.ts`, after `isActiveTask` (line 7)**

```ts
/** A7: the requester's own hand-overs and reviews still waiting on another agent, oldest first. */
export function outgoingRequests<T extends Pick<AgentTaskListItem, "deliverTo" | "status" | "createdAt">>(tasks: readonly T[], requester: string): T[] {
  return tasks.filter((task) => task.deliverTo === requester && isActiveTask(task)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
```

- [ ] **Step 4: Create `components/agents/PendingRequests.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import { formatTaskDuration, outgoingRequests, requestTaskAction } from "./task-view";

const REFRESH_MS = 10_000;

/** A7: what this thread's agent still waits on from other agents. Polls only while the tab is visible. */
export function PendingRequests({ agentName, refreshKey }: { agentName: string; refreshKey: number }) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/agent-ops/tasks", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { tasks?: AgentTaskListItem[] };
        if (response.ok && data.tasks) setTasks(outgoingRequests(data.tasks, agentName));
      } catch {
        // Aborted or offline: keep the last list, the next tick retries.
      }
    };
    const sync = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "visible") return;
      void load();
      timer = setInterval(() => void load(), REFRESH_MS);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [agentName, refreshKey]);

  const cancel = async (id: string) => {
    const failure = await requestTaskAction(`/api/agent-ops/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    setError(failure);
    if (!failure) setTasks((current) => current.filter((task) => task.id !== id));
  };

  if (tasks.length === 0) return null;
  return (
    <div className="agent-pending-strip" role="region" aria-label={t("agents.pending.label")}>
      {tasks.map((task) => (
        <div key={task.id} className="agent-pending-item">
          <span aria-hidden="true">⧗</span>
          <span>{t(task.status === "running" ? "agents.pending.running" : "agents.pending.queued", { name: task.agent ?? "?", age: formatTaskDuration(task) })}</span>
          <span className="agent-pending-title" title={task.title}>{task.title}</span>
          <button type="button" onClick={() => void cancel(task.id)} aria-label={t("agents.pending.cancel", { title: task.title })}>{t("i18n.cancel")}</button>
        </div>
      ))}
      {error && <div role="alert" className="agent-pending-error">{t("agents.error", { error })}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Wire `components/ChatWindow.tsx`**

- Imports, after `import { QueueTaskDialog } from "./agents/QueueTaskDialog";`: `import { PendingRequests } from "./agents/PendingRequests";`
- After line 473 (`const [handQuote, setHandQuote] = …`): `const [pendingRefresh, setPendingRefresh] = useState(0);`
- In `queueMention` (line 465), replace `addNotice({ type: "success", message: t("agents.mention.queued", { name: agent }) });` with:
  ```ts
      addNotice({ type: "success", message: t("agents.mention.queued", { name: agent }) });
      setPendingRefresh((tick) => tick + 1);
  ```
  (`setPendingRefresh` is a stable setter, so the `useCallback` deps stay `[addNotice, trustedAgentName, t]`.)
- Before line 1643 (`{session?.agentProfile && session.agentProfile.trust !== "untrusted" && session.cwd && chatInputRef ? <PromptChips …`):
  ```tsx
        {trustedAgentName ? <PendingRequests agentName={trustedAgentName} refreshKey={pendingRefresh} /> : null}
  ```
- Line 1646, the Task 4 `onQueued` becomes:
  ```tsx
  onQueued={(name) => { addNotice({ type: "success", message: t("agents.mention.queued", { name }) }); setHandQuote(null); setPendingRefresh((tick) => tick + 1); }}
  ```

- [ ] **Step 6: CSS, `app/globals.css`**

After the Task 7 `.agent-event-toggle:focus-visible` rule:

```css
.agent-pending-strip { display: grid; gap: 2px; max-width: var(--chat-content-max-width, 820px); max-height: 7.5em; overflow-y: auto; margin: 0 auto 6px; padding: 0 16px; font-size: 12px; color: var(--text-muted); }
.agent-pending-item { display: flex; gap: 6px; align-items: center; min-width: 0; }
.agent-pending-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); }
.agent-pending-item button { flex-shrink: 0; min-height: 24px; padding: 0 8px; border: 1px solid var(--border); border-radius: 5px; background: none; color: var(--text-muted); font-size: 11px; cursor: pointer; }
.agent-pending-item button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.agent-pending-error { color: #e5484d; }
@media (pointer: coarse) { .agent-pending-item button { min-height: 32px; } }
```

After the keyboard-open block that ends at line 2062 (leave that block untouched: `MobilePwaLayout.test.mjs` pins its exact text), add:

```css
@media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
  html[data-keyboard-open] .agent-pending-strip { display: none; }
}
```

- [ ] **Step 7: i18n (append to each locale)**

`en.ts`:
```ts
    "agents.pending.label": "Requests waiting on other agents",
    "agents.pending.queued": "waiting on {name} · queued {age}",
    "agents.pending.running": "waiting on {name} · running {age}",
    "agents.pending.cancel": "Cancel the request “{title}”",
```
`fr.ts`:
```ts
    "agents.pending.label": "Demandes en attente auprès d'autres agents",
    "agents.pending.queued": "en attente de {name} · en file depuis {age}",
    "agents.pending.running": "en attente de {name} · en cours depuis {age}",
    "agents.pending.cancel": "Annuler la demande « {title} »",
```
`zh-CN.ts`:
```ts
    "agents.pending.label": "等待其他智能体处理的请求",
    "agents.pending.queued": "等待 {name} · 已排队 {age}",
    "agents.pending.running": "等待 {name} · 运行中 {age}",
    "agents.pending.cancel": "取消请求“{title}”",
```
`zh-TW.ts`:
```ts
    "agents.pending.label": "等待其他代理處理的請求",
    "agents.pending.queued": "等待 {name} · 已排隊 {age}",
    "agents.pending.running": "等待 {name} · 執行中 {age}",
    "agents.pending.cancel": "取消請求「{title}」",
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test components/agents/task-view.test.mjs components/agents/PendingRequests.test.mjs components/ChatWindow.hand-to.test.mjs components/MobilePwaLayout.test.mjs lib/i18n/agents-keys.test.mjs lib/i18n/messages.test.mjs`
Expected: PASS.

- [ ] **Step 9: Document**

- `docs/agents/long-term-agents.md`, new bullet after the one starting `- **The user injects by hand.**`:
  ```markdown
  - **Pending strip** (`components/agents/PendingRequests.tsx`, `outgoingRequests` in `components/agents/task-view.ts`). Above the composer of a trusted thread: this agent's requests still queued or running elsewhere (`deliverTo === agent`, oldest first: dialog hand-overs and reviews, `@Name`, and `agent_delegate` calls) from `GET /api/agent-ops/tasks`, every 10 s only while the tab is visible (`visibilitychange` stops and restarts the interval; a queue from the dialog or `@Name` refreshes it at once). Row: "waiting on X · queued 2m 05s" (or running), the title, Cancel → `DELETE /api/agent-ops/tasks/<id>` (errors in a red alert). Gone when empty; hidden while the phone keyboard is open. A cancelled request delivers no card (out of scope, B6).
  ```
- `docs/agents/client-platform.md`, end of `## Keyboard-open height budget (phones)`: append ` The pending requests strip (\`.agent-pending-strip\`) is hidden while the keyboard is open, in a separate rule after the pinned keyboard-open block.`
- `AGENTS.md` File Map, under `components/`, after `agents/TasksBoard.tsx`:
  ```
    agents/PendingRequests.tsx pending strip in a trusted thread: own outgoing requests still queued/running, Cancel; 10 s poll only while the tab is visible
  ```

- [ ] **Step 10: Commit**

```bash
git add components/agents/task-view.ts components/agents/task-view.test.mjs components/agents/PendingRequests.tsx components/agents/PendingRequests.test.mjs components/ChatWindow.tsx components/ChatWindow.hand-to.test.mjs app/globals.css lib/i18n/messages/en.ts lib/i18n/messages/fr.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts docs/agents/long-term-agents.md docs/agents/client-platform.md AGENTS.md
git commit -m "feat(agents): pending requests strip in the requester thread"
```

(Check `git diff --cached AGENTS.md` first: only your File Map line.)

- [ ] **Step 11: Manual check (controller, after deployment)**

1. Desktop: pause Martin, then from Julien "Hand to…" Martin → right after the toast, a strip above the composer reads "⧗ waiting on Martin · queued 0s · <title> · Cancel". The age grows on each 10 s refresh.
2. Desktop: Cancel → the row disappears and the Tasks board shows the task cancelled. Resume Martin, queue again, and let it finish → the row disappears when the card arrives.
3. Desktop: switch to another browser tab for 30 s → the devtools Network panel shows no `/api/agent-ops/tasks` request while hidden, and one on return.
4. Phone 390 px: the strip is one line per request with an ellipsized title. Tapping the composer (keyboard open) hides the strip, and closing the keyboard brings it back.

---

### Task 9: Gates

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0, clean.

- [ ] **Step 3: Full suite**

Run: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" node --experimental-strip-types --test --test-concurrency=2 "app/**/*.test.mjs" "components/**/*.test.mjs" "hooks/**/*.test.mjs" "lib/**/*.test.mjs" "public/**/*.test.mjs"`
Expected: all pass except the known pre-existing failure `lib/codemode-settings.test.mjs` "the mode is read as the codemode extension reads it".

- [ ] **Step 4: Lookbehind and staging check**

Run: `rg -n '\(\?<[=!]' components/agents/queue-task-view.ts components/agents/QueueTaskDialog.tsx components/agents/PendingRequests.tsx components/agents/AgentEventCard.tsx components/agents/task-view.ts components/MessageView.tsx components/ChatWindow.tsx lib/agents/events.ts; git status --short`
Expected: no `rg` match. `git status` shows no uncommitted changes and nothing under `.superpowers/`. If `next dev` appended a `BEGIN:nextjs-agent-rules` block to `AGENTS.md`, leave it out of every commit.

If a gate fails, fix it inside the task that owns the file and amend nothing: add a `fix:` commit with explicit `git add` paths.

---

## Self-review (done while writing)

- **Spec coverage:**
  - B1 → Task 1 (route + docs; `agent_delegate` 8000 untouched).
  - B2 → Task 2 (cap, `clipped`, guard, card note, Inject label/title).
  - B3 → Task 3 (requester push on completion and failure, no double push, fallback).
  - B4 → Task 2 (`purpose`, `handedFrom`, labels, legacy render).
  - B5 → Task 1.
  - A1 → Task 4 (toast via `agents.mention.queued`, red + localized errors).
  - A2 → Task 5.
  - A3 → Task 6.
  - A4 → Task 4.
  - A5 → Task 4.
  - A6 → Task 7.
  - A7 → Task 8.
  - A8 → Task 4.
  - Constraint 10 docs → each task.
- **Placeholders:** none; every code step carries the code.
- **Type consistency:**
  - `HandTarget` (Task 6) is used by `QueueTaskDialog`, `ChatWindow` and `AppShell`.
  - `onQueued: (target: string) => void` (Task 4) is extended in ChatWindow by Task 8.
  - `DELEGATION_TEXT_MAX`, `purpose`, `clipped`, `handedFrom` (Task 2) are read by `AgentEventCard` (Tasks 2, 7).
  - `outgoingRequests` (Task 8) is used by `PendingRequests`.
- **Notes for the reviewer:**
  - Rendering the delegation summary through `MarkdownBody` (spec A6) means markdown images in a result load like images in any assistant message. That is the same exposure as the reviewer's own thread, and no model input changes.
  - The pending strip reads the global task list every 10 s while visible, the same route the Tasks board polls every 5 s while open.
