import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PayloadFormat } from "@/lib/agent-ops/payload-formats";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { HOOK_SECRET_HEADER } from "../../lib/agent-ops/hook-path";
import { isActiveTask } from "./task-view";

export interface TriggerResponse { trigger: PublicTrigger; webhookSecret?: string }

export function hookUrl(origin: string, triggerId: string): string {
  return `${origin}/api/agent-ops/triggers/${triggerId}/hook`;
}

const ALERT_EXAMPLE = (labels: string, summary: string, fingerprint: string) =>
  `{"status":"firing","labels":${labels},"annotations":{"summary":"${summary}"},"fingerprint":"${fingerprint}"}`;
const HOOK_EXAMPLES: Record<PayloadFormat, string> = {
  raw: `{"text":"alert text"}`,
  alertmanager: `{"version":"4","status":"firing","alerts":[${ALERT_EXAMPLE(`{"alertname":"HighCPU","severity":"warning","instance":"web-1"}`, "CPU above 90%", "b1f2c3d4e5a60718")},${ALERT_EXAMPLE(`{"alertname":"DiskFull","severity":"critical","instance":"web-2"}`, "Disk is 98% full", "0a9b8c7d6e5f4321")}]}`,
  grafana: `{"status":"firing","title":"[FIRING:1] LatencyHigh","alerts":[${ALERT_EXAMPLE(`{"alertname":"LatencyHigh","severity":"critical","instance":"api-1"}`, "p99 over 2s", "11aa22bb33cc44dd")}]}`,
};

export function hookCurl(origin: string, triggerId: string, secret: string, format: PayloadFormat = "raw"): string {
  return [
    `curl -X POST '${hookUrl(origin, triggerId)}'`,
    `  -H '${HOOK_SECRET_HEADER}: ${secret}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '${HOOK_EXAMPLES[format]}'`,
  ].join(" \\\n");
}

export function tasksOfTrigger(tasks: readonly AgentTaskListItem[], triggerId: string): AgentTaskListItem[] {
  return tasks.filter((task) => task.triggerId === triggerId);
}

export function triggerActivity(tasks: readonly AgentTaskListItem[], triggerId: string): { active: number; lastFireAt?: string } {
  const own = tasksOfTrigger(tasks, triggerId);
  const lastFireAt = own.reduce<string | undefined>((latest, task) => (!latest || task.createdAt > latest ? task.createdAt : latest), undefined);
  return { active: own.filter(isActiveTask).length, lastFireAt };
}

/** Tasks of the trigger created since the local midnight of `now`: the server's cap rule (`runsTodayCount`), on the loaded task list. */
export function runsTodayOf(tasks: readonly AgentTaskListItem[], triggerId: string, now = Date.now()): number {
  const date = new Date(now);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return tasksOfTrigger(tasks, triggerId).filter((task) => Date.parse(task.createdAt) >= midnight).length;
}

/** Sends one trigger request; resolves to the parsed body, or an error message. */
export async function requestTrigger(url: string, init: RequestInit): Promise<{ data: Partial<TriggerResponse> } | { error: string }> {
  try {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => ({})) as Partial<TriggerResponse> & { error?: string };
    return response.ok ? { data } : { error: data.error ?? `HTTP ${response.status}` };
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : String(reason) };
  }
}

export interface NextFireHint { everyInMinutes?: number | "soon"; dailyAt?: string }

/** Next scheduled fire as the scheduler computes it: an interval fire comes at the first tick of each epoch-aligned
 *  bucket (`floor(now / every)`, lib/agent-ops/scheduler.ts), so after a fire the next one is the next bucket's start;
 *  a feed's interval is a poll, not a fire. Daily `at` is the server clock, shown as written. */
export function nextFireHint(trigger: Pick<PublicTrigger, "enabled" | "everyMinutes" | "at" | "source">, lastFireAt: string | undefined, now = Date.now()): NextFireHint | null {
  if (!trigger.enabled) return null;
  const hint: NextFireHint = {};
  if (trigger.everyMinutes && !trigger.source) {
    const every = trigger.everyMinutes * 60_000;
    const last = lastFireAt ? Date.parse(lastFireAt) : Number.NaN;
    const next = (Math.floor(last / every) + 1) * every;
    hint.everyInMinutes = Number.isNaN(next) || next <= now ? "soon" : Math.ceil((next - now) / 60_000);
  }
  if (trigger.at) hint.dailyAt = trigger.at;
  return hint.everyInMinutes === undefined && hint.dailyAt === undefined ? null : hint;
}
