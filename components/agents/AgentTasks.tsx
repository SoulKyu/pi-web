"use client";

import { type CSSProperties, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import { formatRunUsage } from "@/lib/agents/format-usage";
import { formatTaskDuration, requestTaskAction } from "./task-view";

const smallButton: CSSProperties = { padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" };

function TaskRow({ task, onOpenSession, onChanged, onSelectAgent, compact }: {
  task: AgentTaskListItem;
  compact: boolean;
  onOpenSession: (sessionId: string) => void;
  onChanged: () => void;
  onSelectAgent?: (name: string) => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const url = `/api/agent-ops/tasks/${task.id}`;
  const detail = task.status === "failed" ? task.error : task.result;

  const run = async (init: RequestInit) => {
    const failure = await requestTaskAction(url, init);
    setError(failure);
    if (!failure) onChanged();
    return failure === null;
  };
  const steer = async () => {
    if (await run({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) })) setMessage("");
  };

  const retry = () => void run({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) });

  return (
    <li style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-panel)", display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <strong style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={task.title}>{task.title}</strong>
        {!compact && <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{task.profile}</span>}
        {task.requestedBy && task.requestedBy !== "user" && <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{t("agents.tasks.requestedBy", { name: task.requestedBy })}</span>}
        {task.requestedBy && task.requestedBy !== "user" && onSelectAgent && <button type="button" onClick={() => onSelectAgent(task.requestedBy!)} style={{ ...smallButton, flexShrink: 0 }}>{t("agents.board.openAgent", { name: task.requestedBy })}</button>}
        {task.status === "queued" && task.notBefore && (
          <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>{t("agentOps.task.waitsUntil", { time: new Date(task.notBefore).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</span>
        )}
        <span style={{ marginLeft: "auto", flexShrink: 0, color: task.status === "running" ? "var(--accent)" : "var(--text-muted)" }}>{t(`agentOps.status.${task.status}`)}</span>
        <span style={{ flexShrink: 0, color: "var(--text-dim)" }}>{formatTaskDuration(task)}</span>
        {(task.attempt ?? 1) > 1 && <span style={{ flexShrink: 0, color: "var(--text-dim)" }}>{t("agentOps.attempt", { n: task.attempt! })}</span>}
        {task.usage && (
          <span style={{ flexShrink: 0, color: "var(--text-dim)" }}>
            {`· ${formatRunUsage({ tokens: task.usage.input + task.usage.output + task.usage.cacheRead + task.usage.cacheWrite, cost: task.usage.cost, costEquivalent: task.costEquivalent, turns: task.usage.turns }, { turns: (turns) => t("agents.usage.turns", { turns }), equivalent: t("agents.usage.equivalent") })}`}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {task.sessionId && <button type="button" onClick={() => onOpenSession(task.sessionId!)} style={smallButton}>{t("agentOps.openSession")}</button>}
        {(task.status === "queued" || task.status === "running") && (
          <button type="button" onClick={() => void run({ method: "DELETE" })} style={smallButton}>{t("agentOps.cancelTask")}</button>
        )}
        {(task.status === "completed" || task.status === "failed" || task.status === "cancelled") && (
          <button type="button" onClick={retry} style={smallButton}>{t("agentOps.retry")}</button>
        )}
      </div>
      {task.status === "running" && task.sessionId && (
        <form onSubmit={(event) => { event.preventDefault(); void steer(); }} style={{ display: "flex", gap: 6 }}>
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("agentOps.steerPlaceholder")} style={{ flex: 1, minWidth: 0, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", fontSize: 12 }} />
          <button type="submit" disabled={!message.trim()} style={smallButton}>{t("agentOps.steer")}</button>
        </form>
      )}
      {detail && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>{task.status === "failed" ? t("agentOps.error") : t("agentOps.result")}</summary>
          <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text)", fontFamily: "var(--font-mono)" }}>{detail}</pre>
        </details>
      )}
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agentOps.actionFailed", { error })}</div>}
    </li>
  );
}

export function AgentTasks({ tasks, onOpenSession, onChanged, nested = false, compact = false, onSelectAgent }: {
  tasks: readonly AgentTaskListItem[];
  /** Inside a trigger's history: no heading, no full-row grid span. */
  nested?: boolean;
  /** Inside one agent's space: no heading, no profile column. */
  compact?: boolean;
  onOpenSession: (sessionId: string) => void;
  onChanged: () => void;
  /** The global board: "requested by" links to the requesting agent. */
  onSelectAgent?: (name: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-label={t("agentOps.tasks")} style={{ ...(nested ? {} : { gridColumn: "1 / -1" }), display: "grid", gap: 8 }}>
      {!nested && !compact && <strong style={{ fontSize: 13, color: "var(--text)" }}>{t("agentOps.tasks")}</strong>}
      {tasks.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("agentOps.noTasks")}</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {tasks.map((task) => <TaskRow key={task.id} task={task} onOpenSession={onOpenSession} onChanged={onChanged} onSelectAgent={onSelectAgent} compact={compact} />)}
      </ul>
    </section>
  );
}
