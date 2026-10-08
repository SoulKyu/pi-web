"use client";

import { type CSSProperties, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { StagedFactView } from "@/lib/agent-ops/memory-review";
import { requestTaskAction } from "./task-view";

const smallButton: CSSProperties = { padding: "2px 10px", borderRadius: 0, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" };

function FactRow({ fact, onChanged }: { fact: StagedFactView; onChanged: () => void }) {
  const { locale, t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  const decide = async (approved: boolean) => {
    const failure = await requestTaskAction(`/api/agent-ops/memory/${fact.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    setError(failure);
    if (!failure) onChanged();
  };

  return (
    <li style={{ display: "grid", gap: 4, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text)" }}>{fact.text}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
        <span>{formatRelativeTime(fact.createdAt, locale)}</span>
        {fact.decision ? (
          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{t(`agentOps.memory.${fact.decision}`)}</span>
        ) : (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button type="button" onClick={() => void decide(true)} style={smallButton}>{t("agentOps.memory.approve")}</button>
            <button type="button" onClick={() => void decide(false)} style={smallButton}>{t("agentOps.memory.reject")}</button>
          </span>
        )}
      </div>
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agentOps.actionFailed", { error })}</div>}
    </li>
  );
}

/** Approval queue of one agent's staged memories (expandable, or a plain list when `open`); text is rendered as plain text. */
export function AgentMemory({ facts, onChanged, open = false }: { facts: readonly StagedFactView[]; onChanged: () => void; open?: boolean }) {
  const { t } = useI18n();
  if (facts.length === 0) return null;
  if (open) {
    return (
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {facts.map((fact) => <FactRow key={fact.id} fact={fact} onChanged={onChanged} />)}
      </ul>
    );
  }
  const pending = facts.filter((fact) => fact.decision === null).length;
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>{t("agentOps.memory.summary", { pending, total: facts.length })}</summary>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
        {facts.map((fact) => <FactRow key={fact.id} fact={fact} onChanged={onChanged} />)}
      </ul>
    </details>
  );
}
