"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import { focusModalPanel, listenForPanelEscape } from "@/lib/stacked-dialog";
import type { AgentCard } from "@/lib/agent-ops/overview";
import type { StagedFactView } from "@/lib/agent-ops/memory-review";
import type { AgentTask } from "@/lib/agent-ops/task-store";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { AgentMemory } from "./AgentMemory";
import { AgentTasks } from "./AgentTasks";
import { AgentTriggers } from "./AgentTriggers";
import { AssignTaskDialog } from "./AssignTaskDialog";
import { isActiveTask } from "./task-view";

const POLL_MS = 30_000;
const POLL_RUNNING_MS = 5_000;

export function agentsPollInterval(cards: readonly AgentCard[], tasks: readonly AgentTask[] = []): number {
  return cards.some((card) => card.running) || tasks.some(isActiveTask) ? POLL_RUNNING_MS : POLL_MS;
}

export function AgentsPanel({ onClose, onOpenSession }: {
  onClose: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [cards, setCards] = useState<AgentCard[] | null>(null);
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  const [facts, setFacts] = useState<StagedFactView[] | null>(null);
  const [triggers, setTriggers] = useState<PublicTrigger[] | null>(null);
  const [assigning, setAssigning] = useState<AgentCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const factsOf = (agent: string) => facts?.filter((fact) => fact.agent === agent) ?? [];
  const orphanAgents = facts ? [...new Set(facts.map((fact) => fact.agent))].filter((agent) => !cards?.some((card) => card.profile === agent)) : [];
  const delay = cards ? agentsPollInterval(cards, tasks ?? []) : POLL_MS;

  useEffect(() => listenForPanelEscape(document, onClose), [onClose]);
  useLayoutEffect(() => focusModalPanel(document, dialogRef.current, {
    restoreTextEntry: !window.matchMedia?.("(pointer: coarse)").matches,
  }), []);

  const load = useCallback(async (signal: AbortSignal) => {
    const read = async <T,>(url: string, key: "cards" | "tasks" | "facts" | "triggers"): Promise<T> => {
      const response = await fetch(url, { cache: "no-store", signal });
      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok || !data[key]) throw new Error(data.error ?? `HTTP ${response.status}`);
      return data[key] as T;
    };
    // Independent sections: one failing request must not hide the other.
    const [cardsResult, tasksResult, factsResult, triggersResult] = await Promise.allSettled([
      read<AgentCard[]>("/api/agent-ops/overview", "cards"),
      read<AgentTask[]>("/api/agent-ops/tasks", "tasks"),
      read<StagedFactView[]>("/api/agent-ops/memory", "facts"),
      read<PublicTrigger[]>("/api/agent-ops/triggers", "triggers"),
    ]);
    if (signal.aborted) return;
    if (cardsResult.status === "fulfilled") setCards(cardsResult.value);
    if (tasksResult.status === "fulfilled") setTasks(tasksResult.value);
    if (factsResult.status === "fulfilled") setFacts(factsResult.value);
    if (triggersResult.status === "fulfilled") setTriggers(triggersResult.value);
    const failure = [cardsResult, tasksResult, factsResult, triggersResult].find((r): r is PromiseRejectedResult => r.status === "rejected");
    setError(failure ? (failure.reason instanceof Error ? failure.reason.message : String(failure.reason)) : null);
  }, []);

  const reload = useCallback(() => void load(new AbortController().signal), [load]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), delay);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [delay, load]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("agentOps.title")}
      tabIndex={-1}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="settings-dialog-backdrop"
    >
      <div className="settings-dialog-surface">
        <div className="settings-dialog-header">
          <strong className="settings-dialog-title">{t("agentOps.title")}</strong>
          <button type="button" onClick={onClose} title={t("i18n.close")} aria-label={t("i18n.close")} className="config-close-button settings-dialog-close">×</button>
        </div>
        <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "grid", gap: 12, alignContent: "start", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {error && <div role="alert" style={{ gridColumn: "1 / -1", color: "var(--text-muted)", fontSize: 12 }}>{t("agentOps.loadFailed", { error })}</div>}
          {!cards && !error && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("agentOps.loading")}</div>}
          {cards?.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("agentOps.empty")}</div>}
          {cards?.map((card) => (
            <section
              key={card.profile}
              aria-label={card.displayName}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-panel)", opacity: card.enabled ? 1 : 0.6, minWidth: 0 }}
            >
              <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: card.color ?? "var(--text-dim)" }} />
                <strong style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.displayName}</strong>
                {!card.enabled && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("agentOps.disabled")}</span>}
                {card.running && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)" }}>● {t("agentOps.running")}</span>}
              </header>
              {(card.orphan ? t("agentOps.orphan") : card.description) && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{card.orphan ? t("agentOps.orphan") : card.description}</p>}
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-dim)" }}>
                {card.lastActivity ? t("agentOps.lastActivity", { time: formatRelativeTime(card.lastActivity, locale) }) : t("agentOps.noActivity")}
              </div>
              {card.enabled && (
                <button
                  type="button"
                  onClick={() => setAssigning(card)}
                  style={{ marginTop: 8, padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  {t("agentOps.assign")}
                </button>
              )}
              <AgentMemory facts={factsOf(card.profile)} onChanged={reload} />
              <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 2 }}>
                {card.sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => { onOpenSession(session.id); onClose(); }}
                      title={session.cwd}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "4px 6px", borderRadius: 6, cursor: "pointer", color: "var(--text)", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 8 }}
                      onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(event) => { event.currentTarget.style.background = "none"; }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name || session.id.slice(0, 8)}</span>
                      <span style={{ flexShrink: 0, color: "var(--text-dim)" }}>{formatRelativeTime(session.modified, locale)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {cards && orphanAgents.map((agent) => (
            <section key={`memory-${agent}`} aria-label={agent} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-panel)", minWidth: 0 }}>
              <strong style={{ fontSize: 13, color: "var(--text)" }}>{agent}</strong>
              <AgentMemory facts={factsOf(agent)} onChanged={reload} />
            </section>
          ))}
          {triggers && cards && (
            <AgentTriggers
              triggers={triggers}
              tasks={tasks ?? []}
              cards={cards}
              initialCwd={cards.find((card) => card.sessions[0])?.sessions[0]?.cwd ?? ""}
              onOpenSession={(sessionId) => { onOpenSession(sessionId); onClose(); }}
              onChanged={reload}
            />
          )}
          {tasks && <AgentTasks tasks={tasks} onOpenSession={(sessionId) => { onOpenSession(sessionId); onClose(); }} onChanged={reload} />}
        </main>
        {assigning && (
          <AssignTaskDialog
            profile={assigning.profile}
            displayName={assigning.displayName}
            initialCwd={assigning.sessions[0]?.cwd ?? ""}
            onClose={() => setAssigning(null)}
            onAssigned={reload}
          />
        )}
      </div>
    </div>
  );
}
