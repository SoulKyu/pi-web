import { NextResponse } from "next/server";
import { canEditProfile, splitModel, toAgentDetail } from "@/lib/agents/agent-view";
import { deleteLongTermAgent, getLongTermAgent, updateLongTermAgent, validateUpdateInput } from "@/lib/agents/registry";
import { openThread, threadRunning, unreadCount } from "@/lib/agents/thread";
import { getRpcSession } from "@/lib/rpc-manager";
import { invalidateSessionListCache, invalidateSessionPathCache, resolveSessionPath } from "@/lib/session-reader";
import { registryErrorResponse } from "@/lib/agents/registry-response";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ name: string }> };
const notFound = () => NextResponse.json({ error: "Agent not found" }, { status: 404, headers });

export async function GET(_req: Request, { params }: Context) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return notFound();
  return NextResponse.json({ agent: toAgentDetail(agent, threadRunning(agent), await unreadCount(agent)) }, { headers });
}

// PATCH: role and tools apply at the next open (the trusted thread re-snapshots, lib/rpc-manager.ts); model and
// thinking are sent to the thread so the file records them; avatar only touches the space state.
export async function PATCH(req: Request, { params }: Context) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return notFound();
  const gate = canEditProfile(threadRunning(agent));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers }); }
  const checked = validateUpdateInput(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400, headers });
  try {
    const updated = updateLongTermAgent(agent.name, checked.input);
    if (agent.threadSessionId) {
      const modelChanged = "model" in checked.input && updated.model !== agent.model;
      const thinkingChanged = "thinking" in checked.input && updated.thinking !== agent.thinking;
      if ((modelChanged && updated.model) || (thinkingChanged && updated.thinking)) {
        const { session } = await openThread(updated);
        const model = updated.model ? splitModel(updated.model) : null;
        if (modelChanged && model) await session.send({ type: "set_model", provider: model.provider, modelId: model.modelId });
        if (thinkingChanged && updated.thinking) await session.send({ type: "set_thinking_level", level: updated.thinking });
      }
      if ("role" in checked.input || "toolsPreset" in checked.input) getRpcSession(agent.threadSessionId)?.shutdownWhenIdle();
    }
    return NextResponse.json({ agent: toAgentDetail(updated, threadRunning(updated), await unreadCount(updated)) }, { headers });
  } catch (error) { return registryErrorResponse(error); }
}

// DELETE: profile and space removed, home and thread moved to the trash (reversible by hand).
export async function DELETE(_req: Request, { params }: Context) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return notFound();
  if (threadRunning(agent)) return NextResponse.json({ error: "agent_running" }, { status: 409, headers });
  try {
    const live = agent.threadSessionId ? getRpcSession(agent.threadSessionId) : undefined;
    if (live?.isAlive()) await live.shutdown();
    const threadPath = agent.threadSessionId ? await resolveSessionPath(agent.threadSessionId) : null;
    const trash = deleteLongTermAgent(agent.name, threadPath ?? undefined);
    if (agent.threadSessionId) invalidateSessionPathCache(agent.threadSessionId);
    invalidateSessionListCache();
    return NextResponse.json({ trash }, { headers });
  } catch (error) { return registryErrorResponse(error); }
}
