import { NextResponse } from "next/server";
import { listStagedFacts } from "@/lib/agent-ops/memory-review";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/memory[?agent=] - Memories staged by pi-mem0, waiting for or carrying a decision.
export async function GET(req: Request) {
  try {
    const agent = new URL(req.url).searchParams.get("agent");
    const facts = listStagedFacts().filter((fact) => agent === null || fact.agent === agent);
    return NextResponse.json({ facts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
