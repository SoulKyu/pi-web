import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { listSubagentProfiles } from "@/lib/subagents";
import { buildAgentCards, excludeAgents, readAgentProfileRef, type AgentSessionRef } from "@/lib/agent-ops/overview";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/overview - One card per agent profile, with its sessions and running state.
export async function GET() {
  const [sessions, runningIds] = await Promise.all([listAllSessions(), Promise.resolve(getRunningRpcSessionIds())]);
  const candidates: AgentSessionRef[] = sessions.flatMap((s) => {
    const ref = s.transient ? null : readAgentProfileRef(s.path);
    return ref ? [{ id: s.id, path: s.path, name: s.name, created: s.created, modified: s.modified, cwd: s.cwd, agentProfile: ref.profile }] : [];
  });
  // process.cwd() is the pi-web checkout: keep only built-in and global profiles, never its workspace/project ones.
  const all = listSubagentProfiles(process.cwd()).filter((p) => p.scope === "builtin" || p.scope === "global");
  const profiles = all.filter((p) => !p.longTerm);
  // Long-term agents live in their own view: their thread and isolated runs must not surface as orphan cards.
  const longTerm = new Set(all.filter((p) => p.longTerm).map((p) => p.name));
  const cards = buildAgentCards({ profiles, sessions: excludeAgents(candidates, longTerm, (s) => s.agentProfile), runningSessionIds: new Set(runningIds) });
  return NextResponse.json({ cards }, { headers: { "Cache-Control": "no-store" } });
}
