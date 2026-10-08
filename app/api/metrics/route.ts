import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { renderPrometheus } from "@/lib/agent-ops/metrics";

export const dynamic = "force-dynamic";

function bearerMatches(header: string | null, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const wanted = Buffer.from(token);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// Off unless PI_WEB_METRICS_TOKEN is set. proxy.ts lets exactly this GET skip the session; this bearer is the authentication.
export async function GET(request: Request) {
  const token = process.env.PI_WEB_METRICS_TOKEN;
  if (!token) return new NextResponse(null, { status: 404 });
  if (!bearerMatches(request.headers.get("authorization"), token)) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" } });
  }
  return new NextResponse(renderPrometheus(), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
  });
}
