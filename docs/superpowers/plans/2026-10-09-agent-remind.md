# agent_remind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a trusted-thread long-term agent schedules a one-shot wake-up of its own thread.

**Architecture:** no new scheduler, no new store. `agent_remind` creates an existing thread task `{ agent: self, target: "thread", kind: "reminder", origin: "agent", notBefore }`; the selectors already skip a task until `notBefore`, the thread runner already posts a card then the prompt. Recurrence = the fired run re-arms (same checks again).

**Tech stack:** Next.js server, pi extension API (`defineTool`, `pi.on`), node:test `*.test.mjs` through jiti.

**Spec:** the operator's task brief (2026-10-09) + Phase 0 verdict (PARTIAL: `notBefore` and thread runs exist, no agent-facing tool, triggers have no one-shot).

## Global constraints
- Trusted threads only (`agentProfileExtensionFactories`, beside `agent_delegate`); never isolated, ordinary or Chat-only.
- Refuse when the current run is tainted: a tool outside `TAINT_SAFE_TOOLS` started since this run's `agent_start`. Refuse in a run delegated by another agent.
- Server-side caps: `maxPendingReminders` setting (default 5, 1..50), delay 15 min..30 days, prompt ≤ 2000 chars, ≤ 24 creations per rolling 24 h.
- `when`: ISO-8601 date-time WITH offset, or `<n>m|h|d`. Nothing else.
- Fired prompt: provenance prefix + `fenceExternal(prompt, "reminder")`. Stored text scrubbed (vault values + `redactSecrets`).
- Daily budget (creation, run start, queued gate except still-waiting reminders), pause (selectors + run start), quiet hours (`notBefore` pushed to the window end at creation).
- Audit: create = the tool call line (existing observer); explicit lines for fire and operator cancel.
- i18n in en, fr, zh-CN, zh-TW. Docs in `docs/agents/long-term-agents.md`. No new dependency.

## Review focus
- `when` without an offset (`2026-10-10T09:00`) → refused (server tz is implicit, the model would guess).
- A reminder for tomorrow while today's budget is reached → stays queued (not failed by the gate).
- Retry of a finished reminder → runs now, still fenced (wrap happens at send time).
- A web call earlier in the SAME run, then `agent_remind` → refused.
- Cancel from the tasks panel → `cancelled` + audit line.

### Task 1: `lib/agents/agent-remind.ts` (+ test)
- `reminderRefusal({ tainted, delegated, pending, recent, max })`, `parseWhen(when, now)`, `reminderPrompt(task)`, `createAgentRemindExtension({ agentName, deps? })`.
- Tests: trusted-only registration is Task 3; here: each refusal, parse cases, quiet-hours shift, scrubbed stored text, taint reset on `agent_start`, happy path creates the task and kicks.

### Task 2: wiring
- `thread-run.ts` `promptOfTask`: `kind === "reminder"` → `reminderPrompt`; audit `agent_remind:fire` before the send.
- `budget-gate.ts`: `triggerBudgetRefusal` also for `kind === "reminder"`; `overBudgetTriggerTasks` skips a waiting reminder.
- `task-store.ts`: `kind` += `"reminder"`. `settings.ts`: `maxPendingReminders`. `untrusted-content.ts`: `agent_remind` taint-safe. `audit.ts`: export `scrubSecrets`.
- `app/api/agent-ops/tasks/[id]/route.ts` DELETE: audit `agent_remind:cancel`.
- Tests in the existing `thread-run`, `budget-gate`, `settings`, `untrusted-content` test files.

### Task 3: registration + UI + docs
- `agent-profile-extensions.ts`: add `createAgentRemindExtension` to the trusted list; extend `rpc-manager-agent-env.test.mjs` and `rpc-manager.long-term.test.mjs`.
- `AgentTasks.tsx`: "⏰ reminder" label on `kind === "reminder"`; `agents.tasks.reminder` in 4 locales.
- Docs: `agent_remind` section, Known gap (pi-subagents `schedule.create`), residual risks.
- Verify: tsc, lint, `npm test` (env -i), commit.
