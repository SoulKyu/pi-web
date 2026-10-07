import { NextResponse } from "next/server";
import { readAgentOpsSettings, updateAgentOpsSettings, validateAgentOpsSettingsPatch } from "@/lib/agent-ops/settings";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ settings: readAgentOpsSettings() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const checked = validateAgentOpsSettingsPatch(await req.json());
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    return NextResponse.json({ settings: updateAgentOpsSettings(checked.patch) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
