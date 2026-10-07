import { existsSync } from "node:fs";
import { join } from "node:path";
import { activeTaskCount, planIngestion } from "@/lib/agent-ops/scheduler";
import { inQuietHours, quietHoursEnd } from "@/lib/agent-ops/quiet-hours";
import { readAgentOpsSettings, isPausedFor } from "@/lib/agent-ops/settings";
import { getTrigger, triggerPinStatus, triggersDir, TRIGGER_TOOL_ALLOWLIST } from "@/lib/agent-ops/trigger-store";

export const dynamic = "force-dynamic";

// POST /api/agent-ops/triggers/[id]/dry-run { payload? } - What a fire would do, without doing it: no token, no task, no journal line, no model.
// `tools` is the isolated run's allowlist; a thread target runs with the agent's own tools, reported as [].
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  const trigger = getTrigger(id);
  if (!trigger) return Response.json({ error: "Trigger not found" }, { status: 404, headers });
  let payload: unknown;
  try {
    const raw = await req.text();
    payload = raw.trim() ? (JSON.parse(raw) as { payload?: unknown }).payload : undefined;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }
  const plan = planIngestion(trigger, payload ?? "", Date.now(), activeTaskCount(trigger.id));
  const target = trigger.webhookSecretSha256 ? "isolated" : (trigger.runTarget ?? "thread");
  // A schedule trigger fires its raw template; only a webhook trigger fences a payload.
  const prompt = trigger.webhookSecretSha256 ? plan.prompt : trigger.promptTemplate;
  const settings = readAgentOpsSettings();
  // Admission and cap refusals win over the pause: only an otherwise accepted plan is overridden.
  const shown = plan.verdict === "accepted" && isPausedFor(settings, trigger.profile) ? { ...plan, verdict: "refused" as const, reason: "agent paused" } : plan;
  const now = new Date();
  const deferredUntil = shown.verdict === "accepted" && !trigger.critical && plan.severity !== "critical" && settings.quietHours && inQuietHours(settings.quietHours, now) ? quietHoursEnd(settings.quietHours, now).toISOString() : undefined;
  return Response.json({
    plan: {
      ...shown, // carries the mapped text and its severity
      ...(prompt !== undefined ? { prompt } : {}),
      ...(deferredUntil ? { deferredUntil } : {}),
      tokenFree: !existsSync(join(triggersDir(), plan.tokenName ?? "")),
      tools: target === "isolated" ? (trigger.tools ?? [...TRIGGER_TOOL_ALLOWLIST]) : [],
      pinStatus: triggerPinStatus(trigger),
      target,
    },
  }, { headers });
}
