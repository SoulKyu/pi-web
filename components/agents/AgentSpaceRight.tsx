"use client";

import { useI18n } from "@/hooks/useI18n";
import type { AgentDetail } from "@/lib/agents/agent-view";

// Tasks (Task 17) and Memory (Task 14) mount below the status row.
export function AgentSpaceRight({ agent, running, contextPercent }: { agent: AgentDetail; running: boolean; contextPercent: number | null }) {
  const { t } = useI18n();
  return (
    <div aria-label={agent.name} style={{ padding: "8px", fontSize: 12, color: "var(--text)" }}>
      <div className="agent-space-section">{t("agents.space.status")}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <span>{running ? `● ${t("agents.space.running")}` : `🟢 ${t("agents.space.idle")}`}</span>
        {contextPercent !== null && <span style={{ color: "var(--text-muted)" }}>{t("agents.space.context", { percent: Math.round(contextPercent) })}</span>}
      </div>
    </div>
  );
}
