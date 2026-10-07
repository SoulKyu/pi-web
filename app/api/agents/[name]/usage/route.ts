import { NextResponse } from "next/server";
import { readRunRecords } from "@/lib/agent-ops/run-registry";
import { getLongTermAgent } from "@/lib/agents/registry";
import { summarizeAgentUsage } from "@/lib/agents/usage-summary";

export const dynamic = "force-dynamic";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// GET /api/agents/[name]/usage - today / 7 d / 30 d tokens and cost from the run registry.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!getLongTermAgent(name)) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const records = readRunRecords({ agent: name, since: new Date(Date.now() - WINDOW_MS).toISOString() });
  return NextResponse.json({ usage: summarizeAgentUsage(records) }, { headers: { "Cache-Control": "no-store" } });
}
