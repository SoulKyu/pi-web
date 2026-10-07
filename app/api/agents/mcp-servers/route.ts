import { NextResponse } from "next/server";
import { listGlobalMcpServers } from "@/lib/agents/mcp-access";

export const dynamic = "force-dynamic";

// GET /api/agents/mcp-servers - names of the pi-mcp-adapter servers an agent can be allowed (never their config).
export async function GET() {
  return NextResponse.json({ servers: listGlobalMcpServers() }, { headers: { "Cache-Control": "no-store" } });
}
