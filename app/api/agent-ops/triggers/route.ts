import { createTriggerFromInput, listPublicTriggers, triggerResponse, unexpectedErrorResponse } from "@/lib/agent-ops/trigger-api";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/triggers[?agent=] - All triggers, or the ones of one agent; secrets are never listed (hasWebhookSecret only).
export async function GET(req: Request) {
  try {
    const agent = new URL(req.url).searchParams.get("agent");
    return Response.json({ triggers: listPublicTriggers().filter((trigger) => !agent || trigger.profile === agent) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}

// POST /api/agent-ops/triggers  body: { name, profile (the agent), promptTemplate, everyMinutes?, webhook?, dedupWindowMs?, maxActiveTasks?, enabled? }
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
    return triggerResponse(result, 201);
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
