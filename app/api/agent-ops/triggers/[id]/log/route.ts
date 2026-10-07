import { readTriggerLog } from "@/lib/agent-ops/trigger-log";
import { getTrigger } from "@/lib/agent-ops/trigger-store";
import { rejectedUnauthenticatedCount } from "@/lib/agent-ops/webhook";

export const dynamic = "force-dynamic";

// GET /api/agent-ops/triggers/[id]/log?limit= - Newest-first fire journal (default 100, max 500) and the in-memory count of unauthenticated hook refusals.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!getTrigger(id)) return Response.json({ error: "Trigger not found" }, { status: 404, headers });
  const requested = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 500) : 100;
  return Response.json({ entries: readTriggerLog(id, limit), rejectedUnauthenticated: rejectedUnauthenticatedCount(id) }, { headers });
}
