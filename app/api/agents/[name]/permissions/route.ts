import { NextResponse } from "next/server";
import { listTriggers } from "@/lib/agent-ops/trigger-store";
import { listGlobalMcpServers } from "@/lib/agents/mcp-access";
import { buildAgentPermissions } from "@/lib/agents/permissions";
import { getLongTermAgent } from "@/lib/agents/registry";
import { getRpcSession } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

/** Tool names of the thread's live wrapper; never starts a session. */
async function liveExtensionTools(threadSessionId: string | undefined): Promise<string[] | "unknown-until-start"> {
  const wrapper = threadSessionId ? getRpcSession(threadSessionId) : undefined;
  if (!wrapper?.isAlive()) return "unknown-until-start";
  try {
    const tools = (await wrapper.send({ type: "get_tools" })) as Array<{ name: string; active: boolean }>;
    return tools.filter((t) => t.active).map((t) => t.name).sort();
  } catch { return "unknown-until-start"; }
}

// GET /api/agents/[name]/permissions - what the agent can do, read from files and the live thread (no MCP connection, no session start).
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const permissions = buildAgentPermissions(agent, {
    configuredMcpServers: listGlobalMcpServers(),
    extensionTools: await liveExtensionTools(agent.threadSessionId),
    triggers: listTriggers(),
  });
  return NextResponse.json({ permissions }, { headers: { "Cache-Control": "no-store" } });
}
