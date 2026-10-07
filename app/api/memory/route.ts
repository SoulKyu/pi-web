import { NextResponse } from "next/server";
import { isRequestScope, readMem0Health, readScopeIndex, readSnapshotForScope } from "@/lib/agents/memory";
import { listLongTermAgents } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";
// GET /api/memory?scope=user|project:<id>|agent:<name> - pi-mem0 snapshot of one scope and the scopes to choose from. Snapshots only, never the store.
export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "user";
  if (!isRequestScope(scope)) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  return NextResponse.json({
    items: readSnapshotForScope(scope),
    scopes: {
      user: true,
      projects: Object.entries(readScopeIndex().projects).map(([id, { label }]) => ({ id, label })),
      agents: listLongTermAgents().map((agent) => agent.name),
    },
    health: readMem0Health(),
  }, { headers: { "Cache-Control": "no-store" } });
}
