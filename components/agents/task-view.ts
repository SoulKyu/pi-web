import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";

const ACTIVE = new Set(["queued", "running"]);

export function isActiveTask(task: Pick<AgentTaskListItem, "status">): boolean {
  return ACTIVE.has(task.status);
}

/** "42s" / "3m 05s" / "1h 02m": run time from start (or creation while queued) to completion (or now). */
export function formatTaskDuration(task: Pick<AgentTaskListItem, "createdAt" | "startedAt" | "completedAt">, now = Date.now()): string {
  const from = Date.parse(task.startedAt ?? task.createdAt);
  const to = task.completedAt ? Date.parse(task.completedAt) : now;
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Sends one task action; resolves to an error message, or null on success. */
export async function requestTaskAction(url: string, init: RequestInit): Promise<string | null> {
  try {
    const response = await fetch(url, init);
    if (response.ok) return null;
    const data = await response.json().catch(() => ({})) as { error?: string };
    return data.error ?? `HTTP ${response.status}`;
  } catch (reason) {
    return reason instanceof Error ? reason.message : String(reason);
  }
}
