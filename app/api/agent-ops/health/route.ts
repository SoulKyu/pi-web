import { NextResponse } from "next/server";
import { memAvailableMb } from "@/lib/agent-ops/capacity";
import { collectHealth, healthLevel } from "@/lib/agent-ops/health";
import { runningCount } from "@/lib/agent-ops/runner";
import { inQuietHours } from "@/lib/agent-ops/quiet-hours";
import { readAgentOpsSettings } from "@/lib/agent-ops/settings";
import { countAliveRpcSessions, getExtensionErrorStatuses } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = readAgentOpsSettings();
    const health = collectHealth({
      lastTick: globalThis.__agentOpsLastTick,
      running: { isolated: runningCount("__agentOpsRunning"), thread: runningCount("__agentOpsThreadRunning") },
      sessionsAlive: countAliveRpcSessions(),
      freeMb: memAvailableMb(),
      extensionErrors: getExtensionErrorStatuses(),
      paused: settings.paused,
      quietHours: inQuietHours(settings.quietHours, new Date()),
    });
    return NextResponse.json({ health, level: healthLevel(health) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
