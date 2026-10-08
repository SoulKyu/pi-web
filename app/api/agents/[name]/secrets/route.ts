import { NextResponse } from "next/server";
import { deleteSecret, listSecretNames, SecretError, setSecret } from "@/lib/agents/secrets";
import { getLongTermAgent } from "@/lib/agents/registry";
import { getRpcSession } from "@/lib/rpc-manager";
import { hasJsonContentType } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ name: string }> };
type Body = { name?: unknown; value?: unknown };

// Secrets are read when a session starts: restart an idle thread so the next prompt picks the change up.
async function mutate(req: Request, { params }: Context, apply: (agent: string, name: string, body: Body) => void) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415, headers });
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers }); }
  try {
    if (typeof body?.name !== "string") throw new SecretError("name is required");
    apply(agent.name, body.name, body);
  } catch (error) {
    if (error instanceof SecretError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    throw error;
  }
  if (agent.threadSessionId) getRpcSession(agent.threadSessionId)?.shutdownWhenIdle();
  return new NextResponse(null, { status: 204, headers });
}

// GET /api/agents/[name]/secrets - secret names only; a value is never returned.
export async function GET(_req: Request, { params }: Context) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers });
  return NextResponse.json({ names: listSecretNames(agent.name) }, { headers });
}

// PUT { name, value } - create or replace.
export function PUT(req: Request, context: Context) {
  return mutate(req, context, (agent, name, body) => {
    if (typeof body.value !== "string") throw new SecretError("value is required");
    setSecret(agent, name, body.value);
  });
}

// DELETE { name }
export function DELETE(req: Request, context: Context) {
  return mutate(req, context, (agent, name) => deleteSecret(agent, name));
}
