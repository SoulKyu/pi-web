import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { allowFileRoot } from "../file-access";
import { serializeByKey } from "../key-serializer";
import { getRpcSession, getRunningRpcSessionIds, startRpcSession, type AgentSessionWrapper } from "../rpc-manager";
import { getSessionEntries, invalidateSessionListCache, resolveSessionPath } from "../session-reader";
import type { SessionEntry } from "../types";
import { syncAgentMcpOverrides } from "./mcp-access";
import { AgentRegistryError, ensureAgentRepo, getLongTermAgent, setThreadSessionId, writeMemoryMd, type LongTermAgent } from "./registry";
import { AGENT_EVENT_ENTRY_TYPE, isAgentEventData, type AgentEventData } from "./events";

export interface ThreadDeps {
  start: typeof startRpcSession;
  resolvePath: typeof resolveSessionPath;
  readAgent: typeof getLongTermAgent;
  syncMcp: typeof syncAgentMcpOverrides;
}
const defaultDeps = (): ThreadDeps => ({ start: startRpcSession, resolvePath: resolveSessionPath, readAgent: getLongTermAgent, syncMcp: syncAgentMcpOverrides });
const THREAD_START = Symbol.for("pi-web:agent-thread-start");

/** What the badge counts: the agent's replies and event cards. The user's own messages are read by definition. */
export function isUnreadEntry(entry: SessionEntry): boolean {
  return (entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant")
    || (entry.type === "custom" && entry.customType === AGENT_EVENT_ENTRY_TYPE);
}

/** Entries after `lastReadEntryId` in file order. An unknown or absent marker counts everything: never hide activity. */
export function countUnread(entries: readonly SessionEntry[], lastReadEntryId: string | undefined): number {
  const at = lastReadEntryId ? entries.findIndex((entry) => entry.id === lastReadEntryId) : -1;
  let count = 0;
  for (let index = at + 1; index < entries.length; index += 1) if (isUnreadEntry(entries[index])) count += 1;
  return count;
}

const PREVIEW_MAX = 80;

export interface ThreadSummary { unread: number; failedUnread: boolean; lastPreview?: string; lastActivityAt?: string }

function assistantText(entry: SessionEntry): string {
  const content = (entry as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((part) => (part as { type?: string; text?: string })?.type === "text" ? part.text ?? "" : "").join(" ") : "";
}

/** One pass over the entries the unread count already needs: the rail preview, last activity and whether the newest unread entry is a failed webhook card. Display-only, never fed to a model. */
export function threadSummary(agent: { lastReadEntryId?: string }, entries: readonly SessionEntry[]): ThreadSummary {
  const at = agent.lastReadEntryId ? entries.findIndex((entry) => entry.id === agent.lastReadEntryId) : -1;
  let unread = 0;
  let newestUnread: SessionEntry | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (index > at && isUnreadEntry(entry)) { unread += 1; newestUnread = entry; }
  }
  let lastPreview: string | undefined;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type === "message" && (entry as { message?: { role?: string } }).message?.role === "assistant") {
      const text = assistantText(entry).replace(/\s+/g, " ").trim();
      if (text) { lastPreview = text; break; }
    } else if (entry.type === "custom" && entry.customType === AGENT_EVENT_ENTRY_TYPE) {
      const data = (entry as { data?: unknown }).data;
      if (isAgentEventData(data)) { lastPreview = data.title; break; }
    }
  }
  const last = entries[entries.length - 1];
  const newestData = newestUnread?.type === "custom" ? (newestUnread as { data?: unknown }).data : undefined;
  return {
    unread,
    failedUnread: isAgentEventData(newestData) && newestData.kind === "webhook" && newestData.status === "failed",
    ...(lastPreview ? { lastPreview: lastPreview.slice(0, PREVIEW_MAX) } : {}),
    ...(last?.timestamp ? { lastActivityAt: last.timestamp } : {}),
  };
}

/** Serializes the thread's start and its deletion, so a delete cannot race a reopen. */
export function withThreadLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  return serializeByKey(THREAD_START, name, task);
}

/** The pinned session (D10): created trusted on the first open, reused forever. Concurrent opens share one start. */
export function ensureThread(agent: LongTermAgent, deps: ThreadDeps = defaultDeps()): Promise<{ sessionId: string; path: string }> {
  return withThreadLock(agent.name, () => ensureThreadLocked(agent, deps));
}

/** The body of ensureThread; the caller holds the agent's thread lock. */
export async function ensureThreadLocked(agent: LongTermAgent, deps: ThreadDeps = defaultDeps()): Promise<{ sessionId: string; path: string }> {
  const current = deps.readAgent(agent.name); // re-read inside the lock: a parallel call may have just created it, or a delete removed it
  if (!current) throw new AgentRegistryError("not_found", `agent not found: ${agent.name}`);
  deps.syncMcp(current.home, current.mcpServers); // fail-closed: a server added globally since the last open is blocked before the session loads the adapter
  try { writeMemoryMd(current.home, current.name); } catch (error) { console.error(`[agents] MEMORY.md for ${current.name}:`, error); } // agents created before MEMORY.md existed; never overwrites
  try { ensureAgentRepo(current.home, current.name); } catch (error) { console.error(`[agents] git repo for ${current.name}:`, error); } // homes created before git
  if (current.threadSessionId) {
    const path = await deps.resolvePath(current.threadSessionId);
    if (path && existsSync(path)) return { sessionId: current.threadSessionId, path };
    // Deleted or moved by hand, or never flushed before the idle release: start over.
  }
  const { session, realSessionId } = await deps.start(`__agent_thread__${agent.name}_${randomUUID()}`, "", agent.home, {
    agentProfile: agent.name,
    agentProfileTrust: "trusted",
  });
  session.persistSessionFile();
  allowFileRoot(agent.home);
  invalidateSessionListCache();
  setThreadSessionId(agent.name, realSessionId);
  return { sessionId: realSessionId, path: session.sessionFile };
}

/** The live wrapper of the thread, reopened through the normal open-session path when the idle release closed it. */
export async function openThread(agent: LongTermAgent, deps: ThreadDeps = defaultDeps()): Promise<{ session: AgentSessionWrapper; sessionId: string }> {
  // The lock spans the start, so a delete (same lock) cannot move the file from under the reopen.
  return withThreadLock(agent.name, async () => {
    const { sessionId, path } = await ensureThreadLocked(agent, deps);
    const { session } = await deps.start(sessionId, path, undefined, {});
    return { session, sessionId };
  });
}

export async function appendThreadEvent(agent: LongTermAgent, data: AgentEventData): Promise<string> {
  const { session } = await openThread(agent);
  return session.appendDisplayEntry(AGENT_EVENT_ENTRY_TYPE, data);
}

export function threadRunning(agent: Pick<LongTermAgent, "threadSessionId">): boolean {
  return Boolean(agent.threadSessionId && getRunningRpcSessionIds().includes(agent.threadSessionId));
}

/** ponytail: reads the whole thread file on every rail poll; switch to a bounded tail read if files grow past a few MB. */
export async function threadEntries(
  agent: Pick<LongTermAgent, "threadSessionId">,
  deps: { resolvePath: typeof resolveSessionPath; readEntries: typeof getSessionEntries } = { resolvePath: resolveSessionPath, readEntries: getSessionEntries },
): Promise<SessionEntry[]> {
  if (!agent.threadSessionId) return [];
  try {
    const live = getRpcSession(agent.threadSessionId);
    return live?.isAlive()
      ? (live.inner.sessionManager.getEntries() as unknown as SessionEntry[])
      : await deps.resolvePath(agent.threadSessionId).then((path) => (path && existsSync(path) ? deps.readEntries(path) : []));
  } catch {
    return []; // one unreadable thread must not blank the rail
  }
}

export async function threadStatus(
  agent: Pick<LongTermAgent, "threadSessionId" | "lastReadEntryId">,
  deps?: Parameters<typeof threadEntries>[1],
): Promise<ThreadSummary> {
  return threadSummary(agent, await threadEntries(agent, deps));
}

export async function unreadCount(agent: Pick<LongTermAgent, "threadSessionId" | "lastReadEntryId">, deps?: Parameters<typeof threadStatus>[1]): Promise<number> {
  return (await threadStatus(agent, deps)).unread;
}
