import { NextResponse } from "next/server";
import { listStagedFacts } from "@/lib/agent-ops/memory-review";
import { getLongTermAgent } from "@/lib/agents/registry";
import { listPendingForgets, readAgentMemorySnapshot, readMem0Health } from "@/lib/agents/memory";

export const dynamic = "force-dynamic";
// GET /api/agents/[name]/memory - recent snapshot, pending forget requests, staged approval queue.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json({
    recent: readAgentMemorySnapshot(agent.name),
    pendingForget: listPendingForgets(agent.name),
    health: readMem0Health(),
    staged: listStagedFacts().filter((fact) => fact.agent === agent.name),
  }, { headers: { "Cache-Control": "no-store" } });
}
