import { NextResponse } from "next/server";
import { cancelQueuedTasksOfAgent } from "@/lib/agent-ops/task-store";
import { deleteTriggersOfAgent, repinTriggersOfAgent } from "@/lib/agent-ops/trigger-api";
import { canEditProfile, splitModel, toAgentDetail } from "@/lib/agents/agent-view";
import { agentDetailExtras } from "@/lib/agents/agent-detail-extras";
import { deleteLongTermAgent, ensurePromptsDir, getLongTermAgent, updateLongTermAgent, validateUpdateInput } from "@/lib/agents/registry";
import { openThread, threadRunning, unreadCount, withThreadLock } from "@/lib/agents/thread";
import { getRpcSession, isRpcSessionStarting } from "@/lib/rpc-manager";
import { invalidateSessionListCache, invalidateSessionPathCache, resolveSessionPath } from "@/lib/session-reader";
import { registryErrorResponse } from "@/lib/agents/registry-response";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ name: string }> };
const notFound = () => NextResponse.json({ error: "Agent not found" }, { status: 404, headers });

export async function GET(_req: Request, { params }: Context) {
  const agent = getLongTermAgent((await params).name);
  if (!agent) return notFound();
  ensurePromptsDir(agent.home);
  return NextResponse.json({ agent: toAgentDetail(agent, threadRunning(agent), await unreadCount(agent), agentDetailExtras(agent)) }, { headers });
}

// PATCH: role and tools apply at the next open (the trusted thread re-snapshots, lib/rpc-manager.ts); model and
// thinking are sent to the thread so the file records them; avatar only touches the space state.
export async function PATCH(req: Request, { params }: Context) {
  const { name } = await params;
  if (!getLongTermAgent(name)) return notFound();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers }); }
  const checked = validateUpdateInput(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400, headers });
  const agent = getLongTermAgent(name); // re-read after the body parse: the agent may have changed meanwhile
  if (!agent) return notFound();
  const gate = canEditProfile(threadRunning(agent));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  try {
    const updated = updateLongTermAgent(agent.name, checked.input);
    repinTriggersOfAgent(agent.name); // a saved Profile settings edit is the authenticated drift the pin exists to catch
    if (agent.threadSessionId) {
      const modelChanged = "model" in checked.input && updated.model !== agent.model;
      const thinkingChanged = "thinking" in checked.input && updated.thinking !== agent.thinking;
      if ((modelChanged && updated.model) || (thinkingChanged && updated.thinking)) {
        const { session } = await openThread(updated);
        const model = updated.model ? splitModel(updated.model) : null;
        if (modelChanged && model) await session.send({ type: "set_model", provider: model.provider, modelId: model.modelId });
        if (thinkingChanged && updated.thinking) await session.send({ type: "set_thinking_level", level: updated.thinking });
      }
      // The adapter re-reads its config only when the session restarts.
      if (["role", "toolsPreset", "mcpServers", "memoryCapture", "memoryHint", "memoryRecallLimit", "memoryRecallThreshold", "memorySave", "commandDeny", "webAllowHosts", "sandbox", "sandboxNetwork"].some((key) => key in checked.input)) getRpcSession(agent.threadSessionId)?.shutdownWhenIdle();
    }
    return NextResponse.json({ agent: toAgentDetail(updated, threadRunning(updated), await unreadCount(updated), agentDetailExtras(updated)) }, { headers });
  } catch (error) { return registryErrorResponse(error); }
}

// DELETE: profile and space removed, home and thread moved to the trash (reversible by hand).
export async function DELETE(_req: Request, { params }: Context) {
  const { name } = await params;
  if (!getLongTermAgent(name)) return notFound();
  try {
    return await withThreadLock(name, async () => {
      const agent = getLongTermAgent(name); // re-read under the lock: a thread may have been created while we waited
      if (!agent) return notFound();
      const id = agent.threadSessionId;
      const busy = () => Boolean(id && (isRpcSessionStarting(id) || getRpcSession(id)?.isAlive()));
      const running = () => NextResponse.json({ error: "agent_running" }, { status: 409, headers });
      if (id && isRpcSessionStarting(id)) return running();
      const live = id ? getRpcSession(id) : undefined;
      if (live?.isAlive()) {
        if (live.isRunning()) return running();
        await live.shutdown(); // idle wrapper kept by the idle release: close it, then delete
      }
      if (busy()) return running(); // it came back meanwhile
      const threadPath = id ? await resolveSessionPath(id) : null;
      if (busy()) return running(); // started during the await
      cancelQueuedTasksOfAgent(agent.name); // a queued task must not fire into a vanished agent
      deleteTriggersOfAgent(agent.name); // no trigger may outlive its agent; the agent is idle, nothing fires into the trash
      const trash = deleteLongTermAgent(agent.name, threadPath ?? undefined);
      if (agent.threadSessionId) invalidateSessionPathCache(agent.threadSessionId);
      invalidateSessionListCache();
      return NextResponse.json({ trash }, { headers });
    });
  } catch (error) { return registryErrorResponse(error); }
}
