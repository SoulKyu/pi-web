"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { AgentMemoryItem, JournalEvent, Mem0Health } from "@/lib/agents/memory";
import { requestTaskAction } from "./task-view";

const smallButton: CSSProperties = { padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" };
// A request still pending after this long was refused or is stuck: show the item normally again.
const FORGET_GIVE_UP_MS = 2 * 60 * 1000;
const WATCHER_STALE_MS = 2 * 60 * 1000;

/** Recent memories of one agent (pi-mem0 snapshot); text is rendered as plain text. */
export function AgentMemoryRecent({ agentName, items, events = [], onOpenSession, pending, health, onChanged }: { agentName: string; items: readonly AgentMemoryItem[]; events?: readonly JournalEvent[]; onOpenSession?: (sessionId: string) => void; pending: readonly string[]; health?: Mem0Health; onChanged: () => void }) {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<"recent" | "journal">("recent");
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [health]);

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

  const watcherAge = health?.watcherAt ? now - Date.parse(health.watcherAt) : Infinity;
  const healthNotes = (
    <>
      {!(watcherAge <= WATCHER_STALE_MS) && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agents.memory.watcherStale")}</div>}
      {health?.lastCaptureError && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agents.memory.captureError", { error: health.lastCaptureError })}</div>}
    </>
  );

  const tabs = (
    <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 4 }}>
      {(["recent", "journal"] as const).map((id) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ ...smallButton, color: tab === id ? "var(--text)" : "var(--text-muted)", background: tab === id ? "var(--bg-selected)" : "none" }}>
          {t(id === "recent" ? "agents.memory.tabRecent" : "agents.memory.tabJournal")}
        </button>
      ))}
    </div>
  );

  if (tab === "journal") {
    return (
      <>
        {tabs}
        {events.length === 0 ? <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("agents.memory.journalNone")}</div> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {events.map((event, index) => (
              <li key={`${event.at}-${event.id}-${index}`} style={{ display: "grid", gap: 4, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                {event.text && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text)" }}>{event.text}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
                  <span>{new Date(event.at).toLocaleString(locale)}</span>
                  <span>{event.kind === "add" ? "+" : "−"} {event.kind === "add" ? event.source : "forget"}</span>
                  {event.sessionId && onOpenSession && <button type="button" onClick={() => onOpenSession(event.sessionId!)} style={{ ...smallButton, marginLeft: "auto" }}>{t("agentOps.openSession")}</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {healthNotes}
      </>
    );
  }

  if (items.length === 0) return <>{tabs}<div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("agents.memory.none")}</div>{healthNotes}</>;
  return (
    <>
      {tabs}
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
      {healthNotes}
    </>
  );
}
