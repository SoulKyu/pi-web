import { NextResponse } from "next/server";
import { AgentRegistryError, getLongTermAgent, setLastReadEntryId } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";
const ENTRY_ID = /^[A-Za-z0-9_-]{1,64}$/;
// POST /api/agents/[name]/read  body: { entryId } - the thread was displayed down to this entry.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  let body: { entryId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.entryId !== "string" || !ENTRY_ID.test(body.entryId)) return NextResponse.json({ error: "entryId is required" }, { status: 400 });
  try { setLastReadEntryId(agent.name, body.entryId); } catch (error) {
    if (error instanceof AgentRegistryError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
