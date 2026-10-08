import { getRpcSession, isRpcSessionStarting } from "../rpc-manager";
import { invalidateSessionListCache, invalidateSessionPathCache, resolveSessionPath } from "../session-reader";
import { archiveThread, type LongTermAgent } from "./registry";

export interface ArchiveDeps {
  getSession: typeof getRpcSession;
  isStarting: typeof isRpcSessionStarting;
  resolvePath: typeof resolveSessionPath;
  archive: typeof archiveThread;
  invalidate: (sessionId: string | undefined) => void;
  sleep: (ms: number) => Promise<void>;
}
const defaultDeps = (): ArchiveDeps => ({
  getSession: getRpcSession, isStarting: isRpcSessionStarting, resolvePath: resolveSessionPath, archive: archiveThread,
  invalidate: (id) => { if (id) invalidateSessionPathCache(id); invalidateSessionListCache(); },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
const START_WAIT_MS = 5_000;

/** Archives the pinned thread to the trash. Caller holds `withThreadLock(agent.name)`; no fresh thread is created.
 *  Default: `{ busy: true }` while the thread starts or runs. `force`: abort a running thread, wait (≤ 5 s) for a starting one. */
export async function archiveThreadLocked(agent: LongTermAgent, { force = false }: { force?: boolean } = {}, deps: ArchiveDeps = defaultDeps()): Promise<{ busy: true } | { trash: string | null; stillStarting?: true }> {
  const id = agent.threadSessionId;
  const busy = () => Boolean(id && (deps.isStarting(id) || deps.getSession(id)?.isAlive()));
  let stillStarting = false;
  if (id && force) {
    for (let waited = 0; deps.isStarting(id) && waited < START_WAIT_MS; waited += 100) await deps.sleep(100);
    stillStarting = deps.isStarting(id);
  } else if (id && deps.isStarting(id)) return { busy: true };
  const live = id ? deps.getSession(id) : undefined;
  if (live?.isAlive()) {
    if (force) await live.send({ type: "abort" }).catch(() => {});
    else if (live.isRunning()) return { busy: true };
    await live.shutdown(); // idle wrapper kept by the idle release (or aborted one): close it, then archive
  }
  if (!force && busy()) return { busy: true }; // it came back meanwhile
  const threadPath = id ? await deps.resolvePath(id) : null;
  if (!force && busy()) return { busy: true }; // started during the await
  const trash = deps.archive(agent.name, threadPath ?? undefined);
  deps.invalidate(id);
  return { trash, ...(stillStarting ? { stillStarting: true as const } : {}) };
}
