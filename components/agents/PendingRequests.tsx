"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import { formatTaskDuration, outgoingRequests, requestTaskAction } from "./task-view";

const REFRESH_MS = 10_000;

/** A7: what this thread's agent still waits on from other agents. Polls only while the tab is visible. */
export function PendingRequests({ agentName, refreshKey }: { agentName: string; refreshKey: number }) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(new Set<string>()); // an in-flight poll must not bring a cancelled row back

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/agent-ops/tasks", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { tasks?: AgentTaskListItem[] };
        if (response.ok && data.tasks) setTasks(outgoingRequests(data.tasks, agentName).filter((task) => !cancelledRef.current.has(task.id)));
      } catch {
        // Aborted or offline: keep the last list, the next tick retries.
      }
    };
    const sync = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "visible") return;
      void load();
      timer = setInterval(() => void load(), REFRESH_MS);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [agentName, refreshKey]);

  const cancel = async (id: string, button: HTMLButtonElement) => {
    const failure = await requestTaskAction(`/api/agent-ops/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    setError(failure);
    if (failure) return;
    cancelledRef.current.add(id);
    // The row unmounts: keep focus in the strip on the next row's Cancel, else the previous one.
    const row = button.closest(".agent-pending-item");
    const neighbour = row?.nextElementSibling?.matches(".agent-pending-item") ? row.nextElementSibling : row?.previousElementSibling;
    neighbour?.querySelector("button")?.focus();
    setTasks((current) => current.filter((task) => task.id !== id));
  };

  if (tasks.length === 0) return null;
  return (
    <div className="agent-pending-strip" role="region" aria-label={t("agents.pending.label")}>
      {tasks.map((task) => (
        <div key={task.id} className="agent-pending-item">
          <span aria-hidden="true">⧗</span>
          <span>{t(task.status === "running" ? "agents.pending.running" : "agents.pending.queued", { name: task.agent ?? "?", age: formatTaskDuration(task) })}</span>
          <span className="agent-pending-title" title={task.title}>{task.title}</span>
          <button type="button" onClick={(event) => void cancel(task.id, event.currentTarget)} aria-label={t("agents.pending.cancel", { title: task.title })}>{t("i18n.cancel")}</button>
        </div>
      ))}
      {error && <div role="alert" className="agent-pending-error">{t("agents.error", { error })}</div>}
    </div>
  );
}
