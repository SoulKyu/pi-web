import { NextResponse } from "next/server";
import { getLongTermAgent } from "@/lib/agents/registry";
import { MemoryNotFoundError, requestForget } from "@/lib/agents/memory";
import { withThreadLock } from "@/lib/agents/thread";

export const dynamic = "force-dynamic";
// POST /api/agents/[name]/memory/forget  body: { memoryId } - queue a forget request for pi-mem0's watcher.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  let body: { memoryId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.memoryId !== "string") return NextResponse.json({ error: "memoryId is required" }, { status: 400 });
  const memoryId = body.memoryId;
  try {
    const requestId = await withThreadLock(agent.name, async () => requestForget(agent.name, memoryId));
    return NextResponse.json({ requestId }, { status: 202 });
  } catch (error) {
    if (error instanceof MemoryNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}
