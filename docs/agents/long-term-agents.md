# Long-term agents

## Long-term agents (`lib/agents/**`, `app/api/agents/**`, `components/agents/*`)
- **Files:** `lib/agents/registry.ts` (create/read/patch/delete, `AGENT_NAME_RE`), `registry-response.ts` (`registryErrorResponse`), `thread.ts` (`ensureThread`, `openThread`, `threadRunning`, `countUnread`, `unreadCount`), `agent-view.ts` (list/detail views, `canEditProfile`, `firstUnreadIndex`, `unreadLabel`). Routes: `agents` (GET list / POST create), `agents/[name]` (GET / PATCH / DELETE), `agents/[name]/thread` (POST open), `agents/[name]/read` (POST). UI: `AgentRail`, `AgentAvatar`, `NewAgentDialog`, `AgentProfileDialog`, `AgentSpaceLeft`, `AgentSpaceRight`, `dialog-styles.ts`. Later phases add events, triggers, webhooks, memory and `agent_notify`; none of that exists yet.

## Data model
- An agent is four things: a profile (`~/.pi/agent/agents/<name>.md`, frontmatter `longTerm`), space state (`agent-spaces/<name>.json`: avatar, `createdAt`, `threadSessionId`, `lastReadEntryId`), a home (`agents-home/<name>`, mode 700, the thread's cwd) and, after delete, a `agent-spaces/.trash/<name>-<stamp>/` holding `home` and `thread.jsonl`. Delete is reversible by hand; profile and space file are removed.
- The name is the id and cannot be renamed. Every route resolves the name through `getLongTermAgent` first; `agentHome`, `spacePath`, `setThreadSessionId` and `setLastReadEntryId` take the registry's own names. The name is refused if any profile of any scope matches it case-insensitively (a built-in must not be shadowed) or the home / space file exists.
- `createLongTermAgent` writes space state and home first and the profile last, since the profile is what lists the agent. A failed profile write removes the home and the space file, otherwise the name stays blocked.
- A project profile under a home is never offered: homes are not project cwds.

## Thread
- The thread is one pinned session, started `trusted` (`agentProfileTrust: "trusted"`) with the agent's home as cwd. `ensureThread` is serialized per agent (`serializeByKey`) and re-reads the agent inside the lock, so concurrent opens share one start.
- A new thread is persisted at creation through `persistSessionFile()`: pi delays the first flush until a user/assistant message, and the thread must exist on disk. `ensureThread` reuses the stored `threadSessionId` only if its file exists; a hand-deleted file or a stale path cache starts a new thread.
- Only a reopened session whose newest `pi-web:agent-profile` entry is `trusted` AND whose profile has `longTerm` re-snapshots from the profile (`readSessionAgentTrust`, `lib/subagents.ts`; trusted block in `lib/rpc-manager.ts`). A new profile entry is appended only when `sameResourceSnapshot` differs. Untrusted sessions keep their pinned snapshot. The completion push is suppressed for trusted threads.
- Profile settings: PATCH `agents/[name]` answers 409 `agent_running` while the thread runs (`canEditProfile`). Model and thinking go to a live thread via `set_model` / `set_thinking_level`; role and tools call `shutdownWhenIdle()` so the next open re-snapshots.
- Long-term profiles are never delegable (`lib/subagent-runtime.ts`: the `Agent` tool refuses them) and are hidden from Settings › Sub-agents (`app/api/subagents/profiles/route.ts`).

## Security rules
- Trusted starts and re-snapshots resolve the profile through `resolveLongTermProfile` (`registry.ts`): global scope, exact name. A `.pi/agents` or `.agents/agents` file under the home never applies. A new trusted session must also have the agent's home as cwd.
- `startRpcSession` refuses a new session of a long-term profile unless it is the trusted thread or an isolated run (`agentProfileTools`): `POST /api/agent/new` and `POST /api/agent-ops/tasks` cannot start one.
- Settings › Sub-agents (PUT, PATCH toggle, DELETE) answers 409 `long-term agent` for a long-term name, and PUT strips `longTerm` from the body.
- DELETE runs inside `withThreadLock` (the lock `ensureThread` uses) and re-checks the live wrapper before moving files; `ensureThread` throws `not_found` when the agent vanished.
- Names are at most 64 characters (`AGENT_NAME_MAX`).

## Unread
- Unread = assistant replies after `lastReadEntryId` in file order; an unknown or absent marker counts everything. No divider is drawn for an absent or unknown marker although the badge counts everything. The divider count includes non-message entries; the badge counts assistant replies only. Phase 2 adds event cards.
- `ChatWindow` fixes the marker for the visit (`unreadMarkerEntryId`) so the divider does not move as reads post. `onLatestEntryViewed` posts the read 1 s after the newest entry is visible. When the first unread entry is inside a collapsed process group, the divider is rendered before the group.

## Rail and navigation
- `?agent=` wins over `?session=` and `?cwd=` (`lib/initial-navigation.ts`, `agentName`). `AppShell.openAgent` opens the thread; `pendingAgentRef = { sessionId, agentName }` stays on a matching selection and is cleared only when a different session is picked. The `?agent=` mount effect runs once (ref guard, Strict Mode).
- Deleting an agent (`handleAgentDeleted`) lands on a neutral draft and `router.replace("/")`.
- Homes are left out of `GET /api/sessions` (`isAgentHomePath`) but resolvable by id, so the thread opens through the normal path.
- Layout (`showAgentPanel`): the right panel shows the file viewer whenever a file/terminal tab is active, the agent panel otherwise. Mobile ⓘ toggles a drawer stacking `AgentSpaceLeft` then `AgentSpaceRight`.
- Display entries come from `appendDisplayEntry` on the wrapper, which emits `custom_entry_appended`.

## What is never done
- No delegation to a long-term agent, no listing in Settings › Sub-agents, no re-snapshot of untrusted sessions.
- Phases 2-4 (events, triggers, webhooks, memory) are not implemented; do not document them as existing.

## Known gaps
- PATCH gates on `threadRunning` after the body parse and re-reads the agent first; nothing awaits between the gate and the write, so a turn cannot start in between. DELETE answers 409 `agent_running` for a running or starting thread (`isRpcSessionStarting`); an idle live wrapper is shut down first, then the checks run again before the move.
- The tab bar is hidden while the agent panel shows.
