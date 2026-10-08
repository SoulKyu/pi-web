import { NextResponse } from "next/server";
import { readAudit } from "@/lib/agents/audit";
import { getLongTermAgent } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

// GET /api/agents/[name]/audit?limit= - newest tool calls and policy blocks of the agent, oldest first (arguments only, no results).
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!getLongTermAgent(name)) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  return NextResponse.json({ lines: readAudit(name, { limit: Number.isFinite(limit) ? limit : 50 }) }, { headers: { "Cache-Control": "no-store" } });
}
