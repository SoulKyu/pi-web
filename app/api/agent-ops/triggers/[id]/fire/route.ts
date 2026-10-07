import { fireTriggerNow } from "@/lib/agent-ops/scheduler";
import { kickRunner } from "@/lib/agent-ops/kick";
import { getTrigger } from "@/lib/agent-ops/trigger-store";

export const dynamic = "force-dynamic";

// POST /api/agent-ops/triggers/[id]/fire { payload? } - Run a trigger now (no dedup). 202 { taskId }, or 409 { reason } when refused.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trigger = getTrigger(id);
  if (!trigger) return Response.json({ error: "Trigger not found" }, { status: 404 });
  let payload: unknown;
  try {
    const raw = await req.text();
    payload = raw.trim() ? (JSON.parse(raw) as { payload?: unknown }).payload : undefined;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = fireTriggerNow(trigger, undefined, payload);
  if (!result.accepted) return Response.json({ reason: result.reason }, { status: 409 });
  void kickRunner();
  return Response.json({ taskId: result.taskId }, { status: 202 });
}
