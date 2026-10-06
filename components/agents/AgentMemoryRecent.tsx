"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { AgentMemoryItem } from "@/lib/agents/memory";
import { requestTaskAction } from "./task-view";

const smallButton: CSSProperties = { padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" };
// A request still pending after this long was refused or is stuck: show the item normally again.
const FORGET_GIVE_UP_MS = 2 * 60 * 1000;

/** Recent memories of one agent (pi-mem0 snapshot); text is rendered as plain text. */
export function AgentMemoryRecent({ agentName, items, pending, onChanged }: { agentName: string; items: readonly AgentMemoryItem[]; pending: readonly string[]; onChanged: () => void }) {
  const { locale, t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState<ReadonlySet<string>>(new Set());

  // Keyed by content: the poll hands over a new array each time, which must not restart the timers.
  const pendingKey = pending.join("\n");
  useEffect(() => {
    const timers = pendingKey.split("\n").filter((id) => id && !gaveUp.has(id)).map((id) => setTimeout(() => setGaveUp((prev) => new Set(prev).add(id)), FORGET_GIVE_UP_MS));
    return () => timers.forEach(clearTimeout);
  }, [pendingKey, gaveUp]);

  const forget = async (id: string) => {
    if (!window.confirm(t("agents.memory.forgetConfirm"))) return;
    const failure = await requestTaskAction(`/api/agents/${encodeURIComponent(agentName)}/memory/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId: id }),
    });
    setError(failure);
    if (!failure) {
      setGaveUp((prev) => { const next = new Set(prev); next.delete(id); return next; });
      onChanged();
    }
  };

  const isForgetting = (id: string) => pending.includes(id) && !gaveUp.has(id);

  if (items.length === 0) return <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("agents.memory.none")}</div>;
  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ display: "grid", gap: 4, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text)" }}>{item.text}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
              <span>{formatRelativeTime(item.createdAt, locale)}</span>
              {isForgetting(item.id)
                ? <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{t("agents.memory.forgetting")}</span>
                : <button type="button" onClick={() => void forget(item.id)} style={{ ...smallButton, marginLeft: "auto" }}>{t("agents.memory.forget")}</button>}
            </div>
          </li>
        ))}
      </ul>
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agents.error", { error })}</div>}
    </>
  );
}
