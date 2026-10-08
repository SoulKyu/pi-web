# "Hand to…" / "Ask a review by…" fixes — design

Source review (binding evidence, path:line): `/home/ubuntu/reports/pi-web-agentic/ux/handto-review.md` (end-to-end review at `bad64e6`). This document is the binding authority; where they disagree, this document wins.

## Scope (binding)

In scope: review items A1–A8 (UI) and B1–B5 (small server changes). Out of scope (awaiting a product/security decision, do not implement): non-agent targets and normal-session sources (B8), reviewer read access to the requester's files (B9), cancelled delegation card (B6), retry on a failed delegation card (B7).

## Items

**Server**
- **B1 Quote limit.** `QUOTE_MAX` in `app/api/agents/[name]/tasks/route.ts` becomes 20 000 (equal to `PROMPT_MAX`). Update `docs/agents/long-term-agents.md` (the "mailbox is the task queue" bullet says ≤ 8000). `agent_delegate`'s own 8000 task limit is unchanged.
- **B2 Delegation summary.** Delegation cards (`delegationEventOfTask`, `lib/agents/events.ts`) use a larger summary cap, `DELEGATION_TEXT_MAX = 16 000`, and set `clipped: true` when the text was cut. Other event kinds keep `EVENT_TEXT_MAX`. `isAgentEventData` must accept the new optional field; the card shows a visible "truncated — see the run" note when `clipped`, and the Inject action injects what the card holds and says it is truncated when `clipped` (button title / label suffix).
- **B3 Push to the requester.** In `handleTaskEnd` (`lib/agent-ops/kick.ts`), when `task.deliverTo` is set and the delegation card was appended, keep its entry id and push to the requester: URL `/?agent=<deliverTo>&entry=<id>`, tag `pi-agent:<deliverTo>`, on completion AND on failure, with localized title/body (new `localeText` keys, completed vs failed). For delegated tasks the existing failure push to the executing agent is replaced by this one (no double push). Non-delegated tasks keep today's behaviour.
- **B4 Purpose and provenance.** The delegation event carries `purpose: "review" | "handoff"` (from `task.kind === "review"`); the card label becomes "Review by {name}" / "Result from {name}" (new i18n keys, 4 locales). The thread task event of a user hand-over carries `handedFrom: <deliverTo>` and the target's task card renders "handed over from {name}". Older events without these fields render as today.
- **B5 Review consistency.** The route returns 400 when `purpose === "review"` without `target: "isolated"`, and a review purpose implies `kind: "review"` when `kind` is absent.

**UI**
- **A1 Feedback.** On successful queue, the dialog reports the chosen target back and ChatWindow shows a success notice (reuse `agents.mention.queued` or a new key). Errors in `QueueTaskDialog` render in an error colour (not `--text-muted`); known route errors (quote too long, unknown agent, prompt too long) map to localized messages, unknown ones show the raw text.
- **A2 Buttons reachable.** Copy / Hand to / Ask a review actions in `MessageView` are visible and clickable on touch devices (`(hover: none)` or `useIsMobile`) and when the message has keyboard focus inside it (focus-within), not only on mouse hover. Keep desktop hover behaviour otherwise.
- **A3 Target selector.** The target `<select>` always renders when `targetAgents` is set (even with one entry). A hint explains that the current thread's agent is not listed because an agent cannot hand work to itself. Options show status: paused → "(paused — will wait)", running → "(busy — queued)". Pass `AgentListItem`-shaped objects (name, paused, running) from `AppShell` instead of names only.
- **A4 Client truncation.** The dialog mirrors `QUOTE_MAX = 20 000`; a longer quote is cut to fit with a suffix `…[truncated, X of Y characters]`, and the dialog shows a visible "quote truncated" note.
- **A5 Copy and defaults.** The review dialog has its own placeholder and submit label (not the thread-task ones); a hand-over gets a localized default instruction (editable, like the review prefill); a review's first prompt line becomes "Review: <first line of the quote, ≤ 60 chars>" so task titles are informative.
- **A6 Card rendering.** The delegation card summary renders through `MarkdownBody` (display-only, no file opening), collapsed to a max height with an expand toggle when long.
- **A7 Pending strip.** In an agent thread, a small strip lists this agent's outgoing requests still queued/running (`deliverTo === current agent`, status queued|running) from `GET /api/agent-ops/tasks`, polled only while the agent view is visible (no new background poller when hidden), each "waiting on X · queued Nm" with Cancel → `DELETE /api/agent-ops/tasks/[id]`. Disappears when empty.
- **A8 Discoverability.** The hand-over dialog hint mentions the `@Name task` composer shortcut.

## Global constraints (binding)
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
