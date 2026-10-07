"use client";
import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { isAgentEventData } from "@/lib/agents/events";
import { formatRunUsage } from "@/lib/agents/format-usage";
import type { CustomMessage } from "@/lib/types";
import { requestTaskAction } from "./task-view";

export function AgentEventCard({ message, onOpenSession, onInject }: { message: CustomMessage; onOpenSession?: (sessionId: string) => void; onInject?: (from: string, summary: string) => void }) {
  const { t } = useI18n();
  const [retryState, setRetryState] = useState<"idle" | "done" | string>("idle");
  const data = isAgentEventData(message.details) ? message.details : null;
  if (!data) return null;
  if (data.kind === "delegation") {
    return (
      <div className="agent-event" role="note">
        <div className="agent-event-head">
          <span aria-hidden>↩</span> <strong>{t("agents.event.delegationResult", { name: data.from })}</strong> · <span>{data.title}</span>
          {data.status === "failed" && <span className="agent-event-failed">{t("agents.event.failed")}</span>}
          {data.tainted && <span className="agent-event-failed">{t("agents.event.tainted")}</span>}
          {data.runSessionId && onOpenSession && <button type="button" onClick={() => onOpenSession(data.runSessionId!)} className="agent-event-link">{t("agents.event.seeRun")}</button>}
          {onInject && data.summary && <button type="button" onClick={() => onInject(data.from, data.summary)} className="agent-event-link">{t("agents.event.inject")}</button>}
        </div>
        <div className="agent-event-summary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{data.summary}</div>
      </div>
    );
  }
  const webhook = data.kind === "webhook";
  const icon = data.kind === "schedule" ? "⏱" : data.kind === "task" ? "▶" : "🪝";
  const label = t(data.kind === "schedule" ? "agents.event.schedule" : data.kind === "task" ? "agents.event.task" : (webhook && data.taskKind === "schedule") ? "agents.event.isolated" : "agents.event.webhook");
  return (
    <div className={webhook ? "agent-event agent-event-webhook" : "agent-event"} role="note">
      <div className="agent-event-head">
        <span aria-hidden>{icon}</span> <strong>{label}</strong> · <span>{data.title}</span>
        {webhook && data.status === "failed" && <span className="agent-event-failed">{t("agents.event.failed")}</span>}
        {webhook && data.status === "failed" && retryState === "idle" && (
          <button type="button" className="agent-event-link" onClick={() => void requestTaskAction(`/api/agent-ops/tasks/${data.taskId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) }).then((failure) => setRetryState(failure ?? "done"))}>{t("agentOps.retry")}</button>
        )}
        {webhook && data.runSessionId && onOpenSession && (
          <button type="button" onClick={() => onOpenSession(data.runSessionId!)} className="agent-event-link">{t("agents.event.seeRun")}</button>
        )}
      </div>
      {!webhook && data.fireReason && (
        <div className="agent-event-reason" style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {data.fireReason.payloadHash
            ? t("agents.event.firedByHash", { source: data.fireReason.source, hash: data.fireReason.payloadHash.slice(0, 8) })
            : t("agents.event.firedBy", { source: data.fireReason.source })}
        </div>
      )}
      {retryState !== "idle" && <div role="status" style={{ fontSize: 11, color: "var(--text-dim)" }}>{retryState === "done" ? t("agentOps.status.queued") : t("agentOps.actionFailed", { error: retryState })}</div>}
      {webhook && <div className="agent-event-summary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{data.summary}</div>}
      {webhook && data.usage && (
        <div className="agent-event-usage" style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {`· ${formatRunUsage(data.usage, { turns: (turns) => t("agents.usage.turns", { turns }), equivalent: t("agents.usage.equivalent") })}`}
        </div>
      )}
    </div>
  );
}
