import { NextResponse } from "next/server";
import { abortRunningTasks } from "@/lib/agent-ops/kick";
import { isPausedFor, readAgentOpsSettings, updateAgentOpsSettings, validateAgentOpsSettingsPatch } from "@/lib/agent-ops/settings";
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const checked = validateAgentOpsSettingsPatch(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const settings = updateAgentOpsSettings(checked.patch);
    const aborted = "paused" in checked.patch || "pausedAgents" in checked.patch ? abortRunningTasks((task) => isPausedFor(settings, task.agent ?? task.profile)) : 0;
    return NextResponse.json({ settings, aborted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
