import { NextResponse } from "next/server";
import { getLongTermAgent } from "@/lib/agents/registry";
import { registryErrorResponse } from "@/lib/agents/registry-response";
import { archiveThreadLocked } from "@/lib/agents/thread-archive";
import { ensureThreadLocked, withThreadLock } from "@/lib/agents/thread";

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
      const archived = await archiveThreadLocked(agent);
      if ("busy" in archived) return NextResponse.json({ error: "agent_running" }, { status: 409, headers });
      const { trash } = archived;
      const { sessionId } = await ensureThreadLocked(agent);
      return NextResponse.json({ sessionId, trash }, { headers });
    });
  } catch (error) { return registryErrorResponse(error); }
}
