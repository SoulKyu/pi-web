import { rotateSecret, triggerResponse, unexpectedErrorResponse } from "@/lib/agent-ops/trigger-api";

export const dynamic = "force-dynamic";

// POST /api/agent-ops/triggers/[id]/secret - Generate a new webhook secret (the old one stops working) and return it once.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return triggerResponse(rotateSecret((await params).id));
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
