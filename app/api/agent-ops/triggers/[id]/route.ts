import { deleteTriggerById, patchTrigger, triggerResponse, unexpectedErrorResponse } from "@/lib/agent-ops/trigger-api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/agent-ops/triggers/[id]  body: any of name, profile, promptTemplate, enabled, everyMinutes (null clears), dedupWindowMs, maxActiveTasks
export async function PATCH(req: Request, { params }: Context) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    return triggerResponse(patchTrigger((await params).id, body));
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}

// DELETE /api/agent-ops/triggers/[id] - Its fire tokens are purged by the scheduler after 24 h.
export async function DELETE(_req: Request, { params }: Context) {
  try {
    return triggerResponse(deleteTriggerById((await params).id));
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
