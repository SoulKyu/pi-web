import { NextResponse } from "next/server";
import { getLongTermAgent } from "@/lib/agents/registry";
import { ensureThread } from "@/lib/agents/thread";

export const dynamic = "force-dynamic";
// POST /api/agents/[name]/thread - the pinned session id, created on the first open.
export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  try {
    const { sessionId } = await ensureThread(agent);
    return NextResponse.json({ sessionId, lastReadEntryId: agent.lastReadEntryId ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
