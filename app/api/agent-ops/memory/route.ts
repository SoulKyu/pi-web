import { NextResponse } from "next/server";
import { listSubagentProfiles } from "@/lib/subagents";
import { listStagedFacts } from "@/lib/agent-ops/memory-review";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/memory[?agent=] - Memories staged by pi-mem0, waiting for or carrying a decision.
export async function GET(req: Request) {
  try {
    const agent = new URL(req.url).searchParams.get("agent");
    const staged = listStagedFacts();
    const longTerm = new Set(listSubagentProfiles(process.cwd()).filter((p) => p.longTerm).map((p) => p.name));
    // Without ?agent= this is the legacy panel's queue: long-term agents review their memory in their own view.
    const facts = agent === null ? staged.filter((fact) => !longTerm.has(fact.agent)) : staged.filter((fact) => fact.agent === agent);
    return NextResponse.json({ facts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
