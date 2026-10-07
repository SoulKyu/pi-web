import { NextResponse } from "next/server";
import { isRequestScope, readSnapshotForScope, requestScopeForget } from "@/lib/agents/memory";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const MAX_IDS = 50;

// POST /api/memory/forget  body: { scope, memoryIds } - queue one forget request per id for pi-mem0's watcher. All ids are checked before any is queued.
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  let body: { scope?: unknown; memoryIds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { scope, memoryIds } = body ?? {};
  if (!isRequestScope(scope)) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  if (!Array.isArray(memoryIds) || memoryIds.length === 0 || memoryIds.length > MAX_IDS || !memoryIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: `memoryIds must be 1 to ${MAX_IDS} strings` }, { status: 400 });
  }
  const ids = [...new Set(memoryIds as string[])];
  const known = new Set(readSnapshotForScope(scope).map((item) => item.id));
  if (!ids.every((id) => known.has(id))) return NextResponse.json({ error: "memory not found" }, { status: 404 });
  try {
    return NextResponse.json({ requestIds: ids.map((id) => requestScopeForget(scope, id)) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}
