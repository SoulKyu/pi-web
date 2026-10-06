import { NextResponse } from "next/server";
import { MemoryReviewError, writeDecision } from "@/lib/agent-ops/memory-review";

export const dynamic = "force-dynamic";

// POST /api/agent-ops/memory/[id]/decision  body: { approved } - Approve or reject a staged memory.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: { approved?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "approved must be a boolean" }, { status: 400 });
  }
  try {
    writeDecision((await params).id, body.approved);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MemoryReviewError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "conflict" ? 409 : 404 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
