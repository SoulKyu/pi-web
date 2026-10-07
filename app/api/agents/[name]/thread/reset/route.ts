import { NextResponse } from "next/server";
import { archiveThread, getLongTermAgent } from "@/lib/agents/registry";
import { registryErrorResponse } from "@/lib/agents/registry-response";
import { ensureThreadLocked, withThreadLock } from "@/lib/agents/thread";
import { getRpcSession, isRpcSessionStarting } from "@/lib/rpc-manager";
import { invalidateSessionListCache, invalidateSessionPathCache, resolveSessionPath } from "@/lib/session-reader";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ name: string }> };
const notFound = () => NextResponse.json({ error: "Agent not found" }, { status: 404, headers });

// POST: archive the thread (trash, reversible by hand) and start a fresh one under the same lock. Queued tasks and
// triggers belong to the agent, not the thread: they stay and run in whatever thread opens next.
export async function POST(_req: Request, { params }: Context) {
  const { name } = await params;
  if (!getLongTermAgent(name)) return notFound();
  try {
    return await withThreadLock(name, async () => {
      const agent = getLongTermAgent(name); // re-read under the lock: a thread may have been created while we waited
      if (!agent) return notFound();
      const id = agent.threadSessionId;
      const busy = () => Boolean(id && (isRpcSessionStarting(id) || getRpcSession(id)?.isAlive()));
      const running = () => NextResponse.json({ error: "agent_running" }, { status: 409, headers });
      if (id && isRpcSessionStarting(id)) return running();
      const live = id ? getRpcSession(id) : undefined;
      if (live?.isAlive()) {
        if (live.isRunning()) return running();
        await live.shutdown(); // idle wrapper kept by the idle release: close it, then archive
      }
      if (busy()) return running(); // it came back meanwhile
      const threadPath = id ? await resolveSessionPath(id) : null;
      if (busy()) return running(); // started during the await
      const trash = archiveThread(agent.name, threadPath ?? undefined);
      if (id) invalidateSessionPathCache(id);
      invalidateSessionListCache();
      const { sessionId } = await ensureThreadLocked(agent);
      return NextResponse.json({ sessionId, trash }, { headers });
    });
  } catch (error) { return registryErrorResponse(error); }
}
