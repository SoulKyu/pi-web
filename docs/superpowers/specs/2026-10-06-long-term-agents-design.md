# Long-term agents — design

Date: 2026-10-06 · Status: approved in brainstorming, pending written-spec review
Repos: pi-web (`feat/long-term-agents`, from `local` @ 4f75270) and pi-mem0 (`main` @ 2941ef0)
Mockup of the approved UI: [2026-10-06-long-term-agents-mockup.html](2026-10-06-long-term-agents-mockup.html) (HTML fragment, open in a browser)

## 1. Goal

Make long-term agents first-class citizens of pi-web. Each agent has its own place in the UI, its own
working directory and one continuous conversation it carries over time, like the agent spaces of
agentic web UIs (Letta, Open WebUI, ChatGPT/Claude projects). The user opens pi-web, clicks an
agent and talks to it. The agent remembers, works in its own home, and may have worked on its own
while the user was away. None of this requires configuring a workspace or a cwd.

Success looks like this:
- creating an agent takes one form;
- talking to it is one click;
- its autonomous work (schedules, tasks, webhook alerts) shows up in its thread with an unread badge;
- external content never reaches a fully-tooled agent's context unvetted.

### What this replaces

The shipped "Agent Ops" feature (`docs/agents/agent-ops.md`) is a control panel over ordinary
sessions: profiles run in a cwd the user picks, inside an overlay panel. This design turns the
agent itself into the entity the UI is built around. Agent Ops' backend (task store, runner,
scheduler, webhook, trigger store, memory review) is reused. Its overlay panel is removed.

## 2. Decisions (from the brainstorming, binding)

| # | Question | Decision |
|---|----------|----------|
| D1 | Conversation shape | **One continuous thread per agent** (DM-like, never "closed"). Compaction + pi-mem0 make it last. |
| D2 | Activity while the user is away | **The agent works and reports in its thread**: its schedules and the tasks the user gives it run in the thread. |
| D3 | Trust boundary | **Split by trust level.** Trusted events (its schedules, user tasks) run in its thread with its full tools. Untrusted external content (webhooks) runs in an isolated read-only run; only a summary is posted in the thread. |
| D4 | Working directory | **Automatic home** `~/.pi/agent/agents-home/<name>/`, created with the agent. It is the thread's cwd. Other repos are reached by naming them in the conversation (absolute paths). |
| D5 | Which agents | **Created only from the UI** ("+ New agent"). Existing profiles stay subagents. |
| D6 | UI placement | **Option A, agent rail** (Slack/Discord style), see the mockup. |
| D7 | Creation form | Name, role (system prompt), model + reasoning level, tools preset (read-only / standard / full), avatar (emoji + color). |
| D8 | Memory policy | **Approval only for what comes from outside.** `memory_save` in the trusted thread is stored directly; saves from an isolated webhook run go to the approval queue. |
| D9 | Notifications | **Unread badge on the rail always; web push only for messages the agent marks important, and for failed runs.** |
| D10 | Thread implementation | **Approach 1: one pinned pi session per agent, forever** (not chained sessions, not a custom runtime). |
| D11 | Webhook summaries | **Display-only, outside the agent's context.** The user brings an alert into the conversation on purpose by replying to it. |
| D12 | Event processing | **Strictly sequential per agent** through a per-agent queue; an event waits while a turn runs. |
| D13 | Auto-capture | **On** for trusted threads, into the agent scope, with `AGENT_INSTRUCTIONS`; off for untrusted runs. |

## 3. Non-goals

- Several conversations per agent (projects-style). D1 chose one thread.
- Turning existing subagent profiles into agents automatically. D5 chose explicit creation.
- Sandboxing the agent's own tool use. A trusted agent with `bash` that reads a poisoned file can still be manipulated, as in any pi session. The boundary here covers externally **pushed** content only.
- Agent-to-agent messaging, shared memory between agents, a marketplace of agent templates.
- Migrating Agent Ops data. No trigger was ever created with the shipped code, so the schemas simply change.

## 4. Data model

Agent `<name>`. The name is also the id and follows the existing profile-name rule `^[A-Za-z0-9][A-Za-z0-9._-]*$`
(`lib/subagents.ts`, profile name regex).

1. **Profile**: `~/.pi/agent/agents/<name>.md`, the existing `SubagentProfile` format (`lib/subagents.ts:25`).
   - `systemPrompt` holds the role. `model` and `thinking` come from the form. `tools` is filled from the preset. `color` mirrors the avatar color.
   - One new field: `longTerm: true`.
   - The format is unchanged otherwise, so `startRpcSession(…, { agentProfile })`, the trigger pin (`profilePinSha256`) and pi-mem0's agent detection keep working.
   - Tools presets map to the existing `lib/tool-presets.ts` sets: read-only → `PRESET_READ_ONLY`, standard → `PRESET_DEFAULT`, full → `PRESET_FULL`.
   - The profile is written with `loadExtensions: true` explicitly, because built-in profiles default to `false` (`lib/subagents.ts:171`) and pi-mem0 is an extension. No `extensionTools` list is written: a trusted thread gets every loaded extension tool, like a normal session.
2. **Space state**: `~/.pi/agent/agent-spaces/<name>.json`, written with `writePrivateFileAtomicSync`:
   ```json
   { "name": "leandro", "avatar": { "emoji": "🛠", "color": "#e07a5f" },
     "threadSessionId": "<uuid>", "createdAt": "<ISO>", "lastReadEntryId": "<8hex>" }
   ```
   - `threadSessionId` is the pinned session, created on the first open and reopened forever. It is absent until the first open.
   - `lastReadEntryId` drives the unread badge.
3. **Home**: `~/.pi/agent/agents-home/<name>/`, created at agent creation with mode `0o700`.
   - It is the thread's cwd and is added to the allowed file roots (`allowFileRoot`).
   - It is excluded from the sessions sidebar's project list, so the thread is reached only through the rail.

Rules:
- **Long-term agents are not delegable.** They are excluded from the `subagent` tool's profile list and from any "run this profile" picker. They have a thread; they are not one-off executors.
- **Deleting an agent** removes its profile and space state, and moves its home and thread `.jsonl` into `~/.pi/agent/agent-spaces/.trash/<name>-<timestamp>/` (reversible by hand).
- Renaming is not supported in v1, because the name is the id, the home and the memory scope.

## 5. UI (approved mockup)

**The rail** is a column of avatars on the far left of the app, always visible.
- Each avatar is an emoji on a color, with a red unread badge and a green dot while running.
- "+" opens the creation form. "☰" at the bottom shows today's pi-web (projects/sessions), unchanged.

**The agent space** has three columns:
- **Left**:
  - identity: name, model, tools preset;
  - home files: the existing file tree component, rooted at the home;
  - the agent's triggers (on/off toggle, add/edit);
  - "Profile settings" (edit role, model, tools, avatar).
- **Center**: the thread, built on the existing chat components (`ChatWindow`, `MessageView`, paginated context).
  - A "N new messages" divider marks `lastReadEntryId`.
  - Agent events render as **cards**, not as user bubbles: schedule = orange, webhook summary = purple. A webhook card has a "see the run" link that opens the isolated run read-only.
  - Messages sent through `agent_notify` render with ⚠.
- **Right**:
  - status: idle/running, context usage;
  - memories to approve (from webhook runs);
  - tasks, with "+ queue a task";
  - recent memories, with a "forget" action.

**Creation form**: the D7 fields. The home path is shown, not editable.

**Mobile**: the rail becomes a horizontal strip at the top. The thread is full screen. The left and right panels open as a sheet via an ⓘ button.

The Agent Ops overlay panel and its sidebar-footer "Agents" button are removed, which leaves 3 footer buttons.
All new strings go in `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`. There must be no RegExp lookbehind in client code (old Safari 16.2).

## 6. Thread mechanics

**Lifecycle**
- First open: `startRpcSession` with `agentProfile: <name>`, `cwd` = home and the `pi-web:agent-profile` entry carrying `trust: "trusted"` (§7). The session id is stored as `threadSessionId`.
- Later opens: the same session is reopened through the existing open-session path.
- The existing 10-minute idle release still applies. The next message or event reopens the thread transparently.
- SDK auto-compaction stays on. The UI pages the thread (`/api/sessions/[id]/context` `tail`/`before`), so a year-old thread never loads whole.

**Inputs**

| Source | Trust | Path |
|---|---|---|
| User message | trusted | normal prompt; while the agent runs, the existing `steer`/`follow_up` composer behavior |
| Agent schedule, user task | trusted | per-agent **queue** → a `CustomEntry` `pi-web:agent-event` (`{ version: 1, kind: "schedule" \| "task", triggerId?, taskId?, title }`) is appended, then the event text is sent as a **prompt** in the thread; the UI renders a prompt preceded by such an entry as an event card |
| Webhook | **untrusted** | isolated read-only run (the existing runner/spawn path, `cwd` = the agent's home, the closed tool allowlist, the pin); on completion a `CustomEntry` `pi-web:agent-event` `{ kind: "webhook", triggerId, taskId, summary }` is appended to the thread: **displayed, outside the LLM context** (D11) |

`CustomEntry` vs `CustomMessageEntry`: the SDK keeps `CustomEntry` out of the model context. Webhook summaries must use `CustomEntry`. Event prompts are real prompts (in context, on purpose: they are trusted).

**Per-agent queue (D12)**
- One FIFO per agent, in memory and backed by the task store.
- A queued event starts only when the thread is idle. Events never interleave with a running turn, and user messages keep their normal composer behavior.
- `maxRunMs` (30 min) bounds each event turn: on timeout the turn is aborted (the session stays open) and the task is failed with "timeout". User cancel works the same way.
- Task status/result keep today's semantics (result = last assistant text, 14-day retention).
- The runner's 2-slot cap now applies only to isolated webhook runs. The thread is sequential by construction.

**Unread and notifications (D9)**
- Unread = thread entries after `lastReadEntryId`. It is updated when the thread is displayed on screen.
- `agent_notify(text)` is a pi-web tool registered **only in long-term agent threads**. It sends a web push through the existing push infrastructure (`app/api/push/**`) and renders as ⚠ in the thread.
- A failed event run also sends a push.

## 7. Trust and memory

**Trust signal (pi-web).** The `pi-web:agent-profile` session entry (version 1) gains an additive field `data.trust: "trusted" | "untrusted"`.
- A long-term agent's thread is `trusted`. Isolated webhook runs are `untrusted`.
- **An absent field means `untrusted`** (fail closed), so existing profile sessions keep today's behavior.

**pi-mem0 behavior**

| | Trusted thread | Untrusted run (unchanged) |
|---|---|---|
| `memory_save` | **stored directly**; default scope `agent`; `user` allowed; `project` mapped to `agent` | staged for approval, whatever the scope |
| `memory_forget` | allowed on its **own** `agent` scope only; refused on `user` | refused |
| auto-capture | **on**, into `agent`, with `AGENT_INSTRUCTIONS` (D13) | off |
| recall | agent + user | agent + user (read-only) |
| tools | its preset | the closed read-only allowlist (unchanged) |

**Memory in the UI without pi-web reading the mem0 store** (pi-mem0 stays its only reader and writer):
- **Snapshot.** After every write to an agent scope, pi-mem0 writes a read-only snapshot `<PI_MEM0_DIR>/agents/<name>.json`, atomically, with mode 0600. It holds the newest 200 memories: `{ id, text, createdAt, source }`. pi-web only reads it.
- **Forget request.** The UI's "forget" writes `<PI_MEM0_DIR>/forget/<uuid>.json` (`{ memoryId, agent }`). pi-mem0's watcher (30 s) applies it with the same claim-by-rename/restore protocol as decisions. A request is refused unless the memory belongs to that agent's scope. The snapshot is then refreshed.
- The approval queue for webhook-run saves is the existing staging/decision protocol, moved into the right panel.

## 8. Migration from Agent Ops

| Shipped piece | Becomes |
|---|---|
| Sidebar "Agents" button + overlay panel, cards (`overview`) | removed |
| "Assign task" to any profile + cwd | removed from the UI; tasks are queued **to an agent** from its right panel |
| Task store, runner, scheduler, webhook, purge, retention | kept; the runner executes isolated webhook runs only |
| Triggers | bound to a long-term agent (`profile` must be one); the `cwd` field is removed (= its home); schedule → prompt in the thread via the queue; webhook → isolated run + summary card |
| Memory approval queue | moved into the agent's right panel |
| `docs/agents/agent-ops.md` | updated; a new note covers long-term agents, and AGENTS.md's File Map and Topic Notes are updated |

## 9. Phases

Each phase ships alone, gets a review and a checkpoint before merging. pi-mem0 merges get their own checkpoint, since that repo is loaded live by every pi session.

1. **Agents and thread** (pi-web): registry + profile writer (`longTerm`), creation form, home, rail, agent space (pinned thread, unread badge, left panel, profile settings), exclusion from delegation and from the sessions sidebar.
2. **Events in the thread** (pi-web): per-agent queue, schedules and tasks in the thread, event cards, `agent_notify` + push, triggers bound to agents. Depends on 1.
3. **Webhooks and cleanup** (pi-web): isolated run → display-only summary card, trigger UI and approval queue in the right panel, removal of the Agent Ops overlay. Depends on 2.
4. **pi-mem0 trust levels** (pi-mem0, then pi-web): the `trust` signal read, direct saves, own-scope forget, auto-capture in trusted threads, snapshot + forget requests; on pi-web, the memory section of the right panel. Depends on 1 (the trust field is written in 1).

Order: 1 → 4 → 2 → 3. Phase 4 early makes the thread "remember" from the start.

## 10. Testing

- Pure modules with `node --test` `.mjs` tests, following the repo pattern (set `PI_CODING_AGENT_DIR` to a temp dir before the jiti import):
  - agent registry: names, preset → tools, home creation, deletion to trash;
  - unread count;
  - per-agent queue: ordering, sequential start, timeout;
  - event-entry builders;
  - trust resolution (absent → untrusted);
  - pi-mem0: trust routing of save/forget/capture, snapshot writer, forget-request processing (claim/restore, foreign-scope refusal).
- Never fire pi-mem0's `session_start` in tests: it loads bge-m3 (ruling T8-a of Agent Ops).
- Full suite from inside pi: `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG" …` (AGENTS.md "Learned").
- A manual smoke on a dev server at each checkpoint, with the live :30141 server stopped and only one dev server at a time:
  - create an agent and talk to it;
  - its schedule posts a card;
  - a webhook summary stays out of context (ask the agent about it, it must not know);
  - unread badge and push;
  - memory snapshot and forget.

## 11. Risks

- **Thread file growth**: the `.jsonl` grows forever. Context stays bounded by compaction and the UI pages the file. A year of activity is acceptable for v1. If it becomes a problem, add archiving of the pre-compaction prefix.
- **Same Unix user**: an agent with `bash` can forge decision/forget files or read the memory store, as already documented for Agent Ops. The structural mitigation remains the read-only allowlist for untrusted runs. A trusted agent is trusted by definition.
- **Two pi-web processes** (worktree dev server next to live) would run two schedulers against the same stores. This is documented; never run both.
- **Auto-capture cost**: one extraction LLM call per trusted turn (GLM via headroom), accepted in D13.
