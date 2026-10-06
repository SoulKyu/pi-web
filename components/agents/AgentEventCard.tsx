"use client";
import { useI18n } from "@/hooks/useI18n";
import { isAgentEventData } from "@/lib/agents/events";
import type { CustomMessage } from "@/lib/types";

export function AgentEventCard({ message, onOpenSession }: { message: CustomMessage; onOpenSession?: (sessionId: string) => void }) {
  const { t } = useI18n();
  const data = isAgentEventData(message.details) ? message.details : null;
  if (!data) return null;
  const webhook = data.kind === "webhook";
  const icon = data.kind === "schedule" ? "⏱" : data.kind === "task" ? "▶" : "🪝";
  const label = t(data.kind === "schedule" ? "agents.event.schedule" : data.kind === "task" ? "agents.event.task" : "agents.event.webhook");
  return (
    <div className={webhook ? "agent-event agent-event-webhook" : "agent-event"} role="note">
      <div className="agent-event-head">
        <span aria-hidden>{icon}</span> <strong>{label}</strong> · <span>{data.title}</span>
        {webhook && data.status === "failed" && <span className="agent-event-failed">{t("agents.event.failed")}</span>}
        {webhook && data.runSessionId && onOpenSession && (
          <button type="button" onClick={() => onOpenSession(data.runSessionId!)} className="agent-event-link">{t("agents.event.seeRun")}</button>
        )}
      </div>
      {webhook && <div className="agent-event-summary" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{data.summary}</div>}
    </div>
  );
}
