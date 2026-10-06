import { kickRunner } from "@/lib/agent-ops/kick";
import { handleHook } from "@/lib/agent-ops/webhook";

export const dynamic = "force-dynamic";

// POST /api/agent-ops/triggers/:id/hook - Webhook ingestion. Exempt from the browser session in proxy.ts:
// authenticated by the trigger's shared secret (header x-agent-ops-secret) behind its own throttle.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleHook(req, id, kickRunner);
}
