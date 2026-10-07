import { NextResponse } from "next/server";
import { allowFileRoot } from "@/lib/file-access";
import { toAgentDetail, toAgentListItem } from "@/lib/agents/agent-view";
import { agentsHomeDir, createLongTermAgent, listLongTermAgents, validateCreateInput } from "@/lib/agents/registry";
import { registryErrorResponse } from "@/lib/agents/registry-response";
import { isPausedFor, readAgentOpsSettings } from "@/lib/agent-ops/settings";
import { threadRunning, unreadCount } from "@/lib/agents/thread";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

// GET /api/agents - the rail: every long-term agent with running state and unread count.
export async function GET() {
  const settings = readAgentOpsSettings();
  const agents = await Promise.all(listLongTermAgents().map(async (agent) => toAgentListItem(agent, threadRunning(agent), await unreadCount(agent).catch(() => 0), isPausedFor(settings, agent.name))));
  return NextResponse.json({ agents, agentsHomeDir: agentsHomeDir() }, { headers });
}

// POST /api/agents  body: CreateAgentInput - create the profile, space state and home.
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers }); }
  const checked = validateCreateInput(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400, headers });
  try {
    const agent = createLongTermAgent(checked.input);
    allowFileRoot(agent.home); // the home is browsable in the left panel before any session exists
    return NextResponse.json({ agent: toAgentDetail(agent, false, 0) }, { status: 201, headers });
  } catch (error) { return registryErrorResponse(error); }
}
