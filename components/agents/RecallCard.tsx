"use client";
import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { isRecallEntryData } from "@/lib/agents/recall-card";
import type { CustomMessage } from "@/lib/types";
import { requestTaskAction } from "./task-view";

/** What pi-mem0 recalled for this run. Display-only; hit text is rendered as plain text, never markdown. */
export function RecallCard({ message, agentName }: { message: CustomMessage; agentName?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const data = isRecallEntryData(message.details) ? message.details : null;
  if (!data) return null;

  const forget = async (id: string) => {
    if (!agentName || !window.confirm(t("agents.memory.forgetConfirm"))) return;
    const failure = await requestTaskAction(`/api/agents/${encodeURIComponent(agentName)}/memory/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId: id }),
    });
    setError(failure);
    if (!failure) setRequested((prev) => new Set(prev).add(id));
  };

  return (
    <div className="recall-card" role="note">
      <button type="button" className="recall-card-head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {t("agents.recall.title", { count: data.hits.length, ms: Math.round(data.ms) })}
      </button>
      {open && (
        <ul className="recall-card-hits">
          {data.hits.map((hit) => (
            <li key={hit.id}>
              <span className="recall-card-text">{`[${hit.scope} ${hit.score.toFixed(2)}] ${hit.text}`}</span>
              {hit.scope === "agent" && agentName
                ? <button type="button" disabled={requested.has(hit.id)} onClick={() => void forget(hit.id)}>{t("agents.recall.forget")}</button>
                : <button type="button" disabled title={t("agents.recall.forgetLater")}>{t("agents.recall.forget")}</button>}
            </li>
          ))}
        </ul>
      )}
      {error && <div role="alert" style={{ fontSize: 11 }}>{error}</div>}
    </div>
  );
}
