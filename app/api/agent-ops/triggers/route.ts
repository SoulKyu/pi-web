import { allowFileRoot } from "@/lib/file-access";
import { createTriggerFromInput, listPublicTriggers, triggerResponse, unexpectedErrorResponse } from "@/lib/agent-ops/trigger-api";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/triggers - All triggers; secrets are never listed (hasWebhookSecret only).
export async function GET() {
  try {
    return Response.json({ triggers: listPublicTriggers() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}

// POST /api/agent-ops/triggers  body: { name, profile, cwd, promptTemplate, everyMinutes?, webhook?, dedupWindowMs?, maxActiveTasks?, enabled? }
// Creates a trigger pinned to the profile's current content. With `webhook: true` the response carries the generated secret, once.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const result = createTriggerFromInput(body);
    // Same as /api/agent-ops/tasks: the trigger's cwd must be readable through /api/files at once.
    if (result.ok) allowFileRoot(result.trigger.cwd);
    return triggerResponse(result, 201);
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
