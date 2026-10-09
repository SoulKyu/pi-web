import { NextResponse } from "next/server";
import { memoryMdHistory } from "@/lib/agents/agent-git";
import { getLongTermAgent } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

// GET /api/agents/[name]/memory-md/history - the last 20 commits touching the home's MEMORY.md, newest first, patches capped.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  try {
    return NextResponse.json({ commits: await memoryMdHistory(agent.home) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
