# Agent conversation view — design

Make the long-term agent space read like a Slack/Discord direct message with each agent instead of an IDE transcript. Readability is the primary goal: every rule below is judged by "can the user scan who said what, and read it comfortably".

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Reference | Slack/Discord: everyone left-aligned, name + time headers, author grouping, system lines. |
| Scope | Thread view (§1–§2) and conversation list (§3) in one spec. |
| Conversation list (desktop) | The 44 px rail becomes a 240 px expandable list; collapsing returns the current rail. |
| Tool calls | Hidden in the agent view; one persisted `details` switch shows them as today. |
| Implementation | Agent-view mode in the existing rendering (`data-chat-style="agent"`) plus new fork-only components. No separate `AgentChatWindow`. |

## Scope and constraints (binding)

- **Agent view only.** Ordinary sessions render exactly as today. "Agent view" = `ChatWindow` showing a trusted long-term thread (`trustedAgentName` set).
- **UI only.** No API route, server logic, session format, runtime or permission change. No new poll, no new npm dependency.
- **Upstream files stay thin.** `components/ChatWindow.tsx` and `components/MessageView.tsx` only branch into new fork-only files (`components/agents/conversation/*`); rendering logic for the agent view lives in those files.
- The binding constraints of `2026-10-08-ux-sprints-design.md` apply unchanged (browser floor, i18n in the 4 locales, accessibility, mobile, Escape + `preventDefault`, `MessageView` memo, `.test.mjs` tests, gates, commits). Browser floor is now Safari/iOS 16.4 (`AGENTS.md`).
- Tron palette rules (`docs/agents/ui.md`): no new hue; cyan = system/assistant, orange = user/running, red = error.

## §1 Thread

### 1.1 Author groups

```
⬡  Atlas  14:02
   3 pods en CrashLoopBackOff dans `prod` :
   - api-7f9…
   Je relance le déploiement ?            ← same group (same author, < 5 min)

┃T Toi  14:05
┃  Oui, vas-y.
```

- A **group** is a run of top-level items of the same author (agent or user) where each item is less than 5 min after the previous one and nothing separates them. A day separator, the unread divider, a system line (§1.3) or an author change starts a new group.
- The **group header** (avatar, name, time) is a separate element rendered by `ChatWindow` before the first item of the group. It is not a `MessageView` prop, so memoized messages do not re-render when grouping changes.
- Agent: `AgentAvatar` (28 px) + agent name. User: a neutral initial avatar + the label `Toi` (`agents.chat.you`) + a 2 px orange rule along the group's gutter. Name and rule both mark the user, so it is never told by colour alone.
- Pure helper `components/agents/conversation/author-groups.ts` (+ `.test.mjs`): input = ordered `{ author: "agent" | "user" | "system", timestamp?: string, breaksGroup?: boolean }[]`, output = indexes that open a group. A missing timestamp never merges (it opens a group).

### 1.2 Tool calls hidden, speech acts kept

- With `details` off (default), process groups (`ProcessDetailsGroup`) are not displayed. A CSS rule keyed on `[data-chat-style="agent"][data-agent-details="off"]` hides them, so the markup is unchanged.
- Three tool calls are the agent speaking to the user and stay visible with details off: `agent_notify`, `agent_approve` (title, summary, `pending | approved | denied` in words) and `agent_delegate`. They keep today's `ToolCallBlock` cards (`MessageView.tsx` ~1231-1262), restyled as the agent talking.
- **How (revised during planning):** in conversation mode every assistant block is wrapped in `data-block` / `data-tool`; with details off, CSS hides thinking, non-speech tool calls, the narration inside a finished turn's process, and any assistant message left with nothing to show (`:has()`, Safari 16.4). A finished turn without a speech act renders no process at all. This works the same for live turns (rendered flat) and finished ones, with no extraction component.
- With `details` on, everything renders as today inside the conversation layout.
- **Reveal.** A search hit, a deep link (`?agent=&entry=`) or the unread jump that targets an entry inside a hidden process group shows that one group (the existing `revealProcess` path) until the user leaves the thread.
- The `details` switch sits in the conversation header (§2). It is persisted per browser in `localStorage["pi-agent-details"]` (`"on" | "off"`, unknown → off), read in the `useState` initializer and guarded against SSR.

### 1.3 Events as system lines

```
──────── ⏰ Reminder · 09:00 ────────
──── 📥 Alertmanager · 2 alerts · failed ────
```

- `AgentEventCard` (fork-only) renders collapsed as a centered one-line system line: kind icon, title (plain text, never markdown, as today), and for webhooks the status in words. A click or Enter expands it to today's full card (summary, usage line, links). Delegation results stay open: they are content another agent wrote for the user.
- A failed webhook line is red **and** carries the word `failed`.
- The folded event prompt (`asEventPrompt`) stays as it is: it sits inside the expanded card's flow.
- A system line breaks author groups (§1.1).

### 1.4 "Working…" indicator

- In the agent view the phase line (`ChatWindow.tsx` ~1494) reads `<Agent> is working… · <phaseLabel>` (`agents.chat.working`), placed under the last group with the agent's avatar in the gutter. `phaseLabel` / `phaseAnnouncement` are reused; the `aria-live` region stays.
- Under `prefers-reduced-motion: reduce` the pulse is off (already covered by the sweep; checked again).

### 1.5 Approval panel

- The extension `confirm` panel docked above the composer gets, in the agent view, the agent's avatar and name in its header (`<Agent> asks for your approval`). The buttons and the request flow are unchanged (extension compatibility principle: display only).

### 1.6 Unchanged

Day separators, unread divider, digest, jump pill, recall cards (already folded), prompt chips, pending-requests strip.

## §2 Conversation header

```
┌──────────────────────────────────────────────────────────┐
│ ⬡ Atlas   ● working…                        details [○]  │
│   Watches prod infra and Grafana alerts                  │
└──────────────────────────────────────────────────────────┘
```

- Rendered above the message list in the agent view only: `components/agents/conversation/ConversationHeader.tsx`.
- Line 1: avatar (28 px), name (Geist 600, 15 px), status as dot **and** words. The status comes from the pure helper `components/agents/conversation/presence.ts` (+ test), first match wins:
  1. `needs_input` → `waiting for your answer` (orange);
  2. `running` → `working…`;
  3. `failed` → `last webhook failed` (red);
  4. `paused` (agent or global pause) → `paused`;
  5. health `quietHours` → `quiet hours`;
  6. otherwise → `available · active <relative time>`, or `available` without `lastActivityAt`.
- Line 2: first non-empty line of `AgentDetail.role`, one line, ellipsis, `--text-muted`. Omitted when empty.
- Right: the `details` switch (`Switch` primitive inside a ≥ 44 px label row on touch).
- Data: `AgentListItem` (rail poll), `AgentDetail`, `useHealthPoll`. All are already loaded, so no request is added.
- Phones: same header, role line hidden below 400 px.

## §3 Expandable rail (conversation list)

```
┌ AGENTS ───────────────── « ┐
│ ⬡● Atlas              14:02│
│    Weekly report ready, 3 …│
│ ⬡  Nova  2             yest│   ← unread: bold name + count
│    Disk alert /var 91 %    │
│ ⬡◐ Zed                 Mon │
│    waiting for your answer │   ← needs_input replaces the preview
│ ───────────────────────────│
│ + New agent                │
│ 📥 Inbox 3    ☰ Tasks      │
│ ⌂ Sessions    ● Health  ⏸  │
└────────────────────────────┘
```

- Desktop vertical rail only. `expanded` = 240 px list, collapsed = today's 44 px rail, unchanged.
- Row: avatar 32 px with the existing state dot. Line 1 = name + time (right-aligned, tabular figures). Line 2 = preview (one line, ellipsis, `--text-muted`). Unread: bold name + count in words for screen readers. `needs_input` shows `waiting for your answer` instead of the preview; `failed` shows `last webhook failed`.
- **Order is the rail order**, never recency: `Ctrl+Alt+1..9` and `Alt+↑/↓` must keep targeting the same agents.
- Time: pure helper `components/agents/conversation/list-time.ts` (+ test). Today → `HH:MM`; yesterday → localized "yesterday"; under 7 days → short weekday; else → short date (year only outside the current year). `Intl.DateTimeFormat` with the app locale, local calendar days (same rule as `lib/day-separators.ts`).
- Footer actions (new agent, inbox, tasks, sessions, health, pause) become labelled rows; behaviour unchanged. The health popover keeps its fixed positioning.
- Toggle `«` / `»` at the top, with an accessible name. State persisted in `localStorage["pi-agent-rail-expanded"]`. On first visit, it defaults to expanded when `window.innerWidth >= 1280`.
- Each row is a button with `aria-current` on the active agent and an `aria-label` of name, status, unread count and preview. Focus ring `:focus-visible`.
- Phones: the horizontal rail is unchanged.
- `components/agents/AgentRail.tsx` gains the expanded layout; `AgentRail.test.mjs` is updated where asserted markup changes.

## §4 Readability (agent view, cross-cutting)

### Measure and rhythm
- Prose capped at **72ch**: `p`, lists, blockquotes and headings in `.markdown-body`. Code blocks, tables, diffs and images keep the full column (`--chat-content-max-width`, 820 px). Today the column is ~115 characters per line at 14 px.
- Body **15 px**, line-height **1.6**, paragraph gap **0.75em**. The +1 px is added on top of the user's `--chat-content-font-size` offset, so Settings › Fonts still applies.
- Spacing carries grouping: **20 px** between groups, **4 px** between items of a group, no separators drawn between groups.

### Hierarchy
- A 40 px gutter holds the avatar; the text aligns with the name, so scanning the left edge tells who speaks without reading.
- Name: 600, `--text`. Time: 12 px, `--text-dim`, tabular figures. Contrast on `#000`: `--text` ≈ 18:1, `--text-muted` ≈ 8:1, `--text-dim` ≈ 5.8:1, all ≥ AA.
- System lines: 12 px, `--text-muted`, centered, so they never compete with a message.
- **No Orbitron (`--font-hud`) in the thread or the list.** Names and text use the UI font.

### Noise
- Tool calls hidden (§1.2). Model name and usage show only while the message is hovered or focused.
- Times of the non-first items of a group show in the gutter on hover or keyboard focus only. On touch, only the group header carries a time.
- Links are underlined (cyan is also the system colour, so colour alone does not mark a link).

### Guards
- No glow or animation on messages.
- No new per-message prop whose identity changes during streaming (`MessageView` memo).

## Files

New (fork-only), under `components/agents/conversation/`:
- `author-groups.ts` + `author-groups.test.mjs`
- `presence.ts` + `presence.test.mjs`
- `list-time.ts` + `list-time.test.mjs`
- `prefs.ts` (details and rail-expanded `localStorage` prefs)
- `GroupHeader.tsx`, `ConversationHeader.tsx`
- `app/agent-conversation.css`, imported once in `app/layout.tsx`, rules scoped under `[data-chat-style="agent"]`, `.conv-*`, `.agent-event-line` or `.agent-rail-expanded`

Changed:
- `components/ChatWindow.tsx`: `data-chat-style` / `data-agent-details` attributes, group headers in the render loop, speech-act extraction, the header, the working line text, approval panel header.
- `components/MessageView.tsx`: one boolean prop `conversation` (in the memo comparator): plain user layout, no model label row, blocks tagged `data-block` / `data-tool`.
- `components/agents/AgentEventCard.tsx`: collapsed system-line state.
- `components/agents/AgentRail.tsx` (+ test): expanded layout and toggle.
- `components/AppShell.tsx`: passes the active `AgentListItem`, `agentDetail` and the `useHealthPoll` result (all already computed there) to `ChatWindow` for the header.
- `lib/i18n/messages/{en,fr,zh-CN,zh-TW}.ts`: new keys under `agents.chat.*`, `agents.presence.*`, `agents.rail.*`.
- `docs/agents/long-term-agents.md`: a "Conversation view" section; `docs/agents/ui.md`: the 72ch / 15 px agent-view rule.

## Testing

- Pure helpers: one `.test.mjs` each (grouping edges: 5 min boundary, missing timestamp, day change, divider, system line; presence priority order; list time: today / yesterday / 6 days / 8 days / other year; speech-act parsing of malformed inputs).
- Source assertions: `AgentRail.test.mjs` (expanded row markup, order unchanged), a small `ChatWindow` assertion that ordinary sessions get no `data-chat-style`.
- Manual check in the dev server (`npm run dev`, port 30141). Desktop: a thread with tools, notify, approve, delegate, a webhook failure, a reminder; toggle `details`; search hit inside a hidden group; unread jump; rail collapse/expand and shortcuts. Phone width: header, horizontal rail, keyboard open.
- Gates: `node_modules/.bin/tsc --noEmit`, `npm run lint`, full suite with the `env -i` prefix.

## Out of scope

Always-sendable composer with queued/delivered marks, reply to a specific message, multi-agent channels, the running task's title in the header, recency sorting of the list, previews in the phone rail.
