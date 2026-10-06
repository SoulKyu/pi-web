import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { HOOK_SECRET_HEADER } from "../../lib/agent-ops/hook-path";
import { isActiveTask } from "./task-view";

export interface TriggerResponse { trigger: PublicTrigger; webhookSecret?: string }

export function hookUrl(origin: string, triggerId: string): string {
  return `${origin}/api/agent-ops/triggers/${triggerId}/hook`;
}

export function hookCurl(origin: string, triggerId: string, secret: string): string {
  return [
    `curl -X POST '${hookUrl(origin, triggerId)}'`,
    `  -H '${HOOK_SECRET_HEADER}: ${secret}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '{"text":"alert text"}'`,
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
