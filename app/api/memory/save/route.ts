import { NextResponse } from "next/server";
import { isRequestScope, isSaveText, readSnapshotForScope, requestScopeSave } from "@/lib/agents/memory";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

// POST /api/memory/save  body: { scope, text, replaces? } - promote a fact to a scope, or correct `replaces` in it, for pi-mem0's watcher. `replaces` is checked against one snapshot read.
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403, headers: NO_STORE });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415, headers: NO_STORE });
  let body: { scope?: unknown; text?: unknown; replaces?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE }); }
  const { scope, text, replaces } = body ?? {};
  if (!isRequestScope(scope)) return NextResponse.json({ error: "Invalid scope" }, { status: 400, headers: NO_STORE });
  if (!isSaveText(text)) return NextResponse.json({ error: "text must be 1 to 4096 characters and must not contain [REDACTED]" }, { status: 400, headers: NO_STORE });
  if (replaces !== undefined && typeof replaces !== "string") return NextResponse.json({ error: "replaces must be a string" }, { status: 400, headers: NO_STORE });
  if (replaces !== undefined && !readSnapshotForScope(scope).some((item) => item.id === replaces)) {
    return NextResponse.json({ error: "memory not found" }, { status: 404, headers: NO_STORE });
  }
  try {
    return NextResponse.json({ requestId: requestScopeSave(scope, text, replaces) }, { status: 202, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400, headers: NO_STORE });
  }
}
