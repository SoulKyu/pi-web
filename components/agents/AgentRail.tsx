"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/i18n/format";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import type { AgentOpsHealth } from "@/lib/agent-ops/health";
import { samePlannotator, type PlannotatorConfig } from "@/lib/plannotator";
import { AgentAvatar } from "./AgentAvatar";

type HealthLevel = "ok" | "warn" | "down";
export interface HealthState { health: AgentOpsHealth; level: HealthLevel; plannotator: PlannotatorConfig | null }
const HEALTH_COLORS: Record<HealthLevel, string> = { ok: "#3fb950", warn: "#d29922", down: "#f85149" };

/** Polls the internal health gauges every 30 s while the tab is visible; null until the first answer or when the route fails. */
export function useHealthPoll(): HealthState | null {
  const [state, setState] = useState<HealthState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/agent-ops/health", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { health?: AgentOpsHealth; level?: HealthLevel; plannotator?: PlannotatorConfig | null };
        setState((prev) => {
          if (!response.ok || !data.health || !data.level) return null;
          const plannotator = data.plannotator ?? null;
          return { health: data.health, level: data.level, plannotator: prev && samePlannotator(prev.plannotator, plannotator) ? prev.plannotator : plannotator };
        });
      } catch {
        if (!controller.signal.aborted) setState(null);
      }
    };
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => { void load().finally(() => { if (!controller.signal.aborted) arm(); }); }, 30_000);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); arm(); };
    void load();
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return state;
}

/** Polls the agent list: the running dot and the unread badge must move, so 5 s while the tab is visible, 30 s hidden. */
export function useAgentsPoll(): { agents: AgentListItem[]; agentsHomeDir?: string; paused: boolean; error: string | null; lastOkAt: number | null; reload: () => void } {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [agentsHomeDir, setAgentsHomeDir] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/agents", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { agents?: AgentListItem[]; agentsHomeDir?: string; paused?: boolean; error?: string };
        if (!response.ok || !data.agents) throw new Error(data.error ?? `HTTP ${response.status}`);
        setAgents(data.agents);
        setAgentsHomeDir(data.agentsHomeDir);
        setPaused(data.paused === true);
        setLastOkAt(Date.now());
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void load().finally(() => { if (!controller.signal.aborted) arm(); }); }, document.visibilityState === "visible" ? 5_000 : 30_000);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); arm(); };
    void load();
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reloadTick]);

  return { agents, agentsHomeDir, paused, error, lastOkAt, reload };
}

const railButtonStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, padding: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, fontSize: 16 };

export function AgentRail({ agents, activeAgent, onSelectAgent, onNewAgent, onShowSessions, onShowTasks, onShowInbox, orientation, paused, error, lastOkAt, onPauseChanged, healthState }: {
  healthState: HealthState | null;
  agents: readonly AgentListItem[];
  activeAgent: string | null;
  onSelectAgent: (name: string) => void;
  onNewAgent: () => void;
  onShowSessions: () => void;
  onShowTasks: () => void;
  onShowInbox: () => void;
  orientation: "vertical" | "horizontal";
  paused: boolean;
  error: string | null;
  lastOkAt: number | null;
  onPauseChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const vertical = orientation === "vertical";
  const healthTitle = healthState && [
    t(`agents.health.${healthState.level}`),
    t("agents.health.details", {
      tick: healthState.health.lastTickAt ? new Date(healthState.health.lastTickAt).toLocaleTimeString() : "–",
      isolated: healthState.health.running.isolated,
      thread: healthState.health.running.thread,
      freeMb: healthState.health.freeMb ?? "–",
    }),
    healthState.health.extensionErrors[0]?.text,
  ].filter(Boolean).join("\n");
  const inboxUnread = agents.reduce((sum, agent) => sum + agent.unread, 0);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [confirmingPause, setConfirmingPause] = useState(false);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const pauseCancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmingPause) pauseCancelRef.current?.focus(); }, [confirmingPause]);
  useEffect(() => { if (paused) setConfirmingPause(false); }, [paused]);
  const closePauseConfirm = () => {
    setConfirmingPause(false);
    requestAnimationFrame(() => pauseButtonRef.current?.focus());
  };
  const setPausedAll = async (next: boolean) => {
    try {
      const response = await fetch("/api/agent-ops/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: next }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? `HTTP ${response.status}`);
      setPauseError(null);
    } catch (cause) {
      setPauseError(cause instanceof Error ? cause.message : String(cause));
    } finally { onPauseChanged(); }
  };
  return (
    <nav aria-label={t("agents.rail.shortcutsHint")} className={vertical ? "agent-rail" : "agent-rail agent-rail-horizontal"}>
      {agents.map((agent, index) => (
        <button
          key={agent.name}
          type="button"
          onClick={() => onSelectAgent(agent.name)}
          aria-current={agent.name === activeAgent ? "true" : undefined}
          aria-label={[agent.name, agent.unread > 0 ? t("agents.rail.unread", { count: agent.unread }) : "", agent.state === "needs_input" ? t("agents.rail.needsInput") : agent.running ? t("agents.rail.running") : agent.state === "failed" ? t("agents.rail.failed") : ""].filter(Boolean).join(", ")}
          title={[agent.name + (index < 9 ? ` · Ctrl+Alt+${index + 1}` : ""), [agent.lastPreview, agent.lastActivityAt && formatRelativeTime(agent.lastActivityAt, locale)].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}
          style={{ ...railButtonStyle, borderRadius: "50%" }}
        >
          <AgentAvatar avatar={agent.avatar} running={agent.running} state={agent.state} unread={agent.unread} selected={agent.name === activeAgent} title={agent.name} />
        </button>
      ))}
      <button type="button" onClick={onNewAgent} aria-label={t("agents.rail.new")} title={t("agents.rail.new")} style={railButtonStyle}>+</button>
      {healthState && <span role="img" aria-label={t(`agents.health.${healthState.level}`)} title={healthTitle ?? undefined} style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: HEALTH_COLORS[healthState.level] }} />}
      {healthState?.health.quietHours && <span role="img" aria-label={t("agentOps.quietHours.active")} title={t("agentOps.quietHours.active")} style={{ fontSize: 12 }}>🌙</span>}
      {confirmingPause ? (
        <div
          role="group"
          aria-label={t("agentOps.pause.confirm")}
          title={t("agentOps.pause.confirm")}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            closePauseConfirm();
          }}
          style={{ display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", gap: 4, flexShrink: 0 }}
        >
          <button type="button" onClick={() => { closePauseConfirm(); void setPausedAll(true); }} aria-label={t("agentOps.pause.confirmYes")} title={t("agentOps.pause.confirm")} style={{ ...railButtonStyle, ...(vertical ? {} : { width: "auto", padding: "0 8px", gap: 4, fontSize: 12 }), color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 6 }}>✓{!vertical && <span>{t("agentOps.pause.confirmYes")}</span>}</button>
          <button ref={pauseCancelRef} type="button" onClick={closePauseConfirm} aria-label={t("i18n.cancel")} title={t("i18n.cancel")} style={{ ...railButtonStyle, ...(vertical ? {} : { width: "auto", padding: "0 8px", gap: 4, fontSize: 12 }), border: "1px solid var(--border)", borderRadius: 6 }}>✕{!vertical && <span>{t("i18n.cancel")}</span>}</button>
        </div>
      ) : (
        <button ref={pauseButtonRef} type="button" onClick={() => (paused ? void setPausedAll(false) : setConfirmingPause(true))} aria-label={paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")} title={paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")} aria-pressed={paused} style={{ ...railButtonStyle, color: paused ? "var(--accent)" : "var(--text-muted)" }}>{paused ? "▶" : "⏸"}</button>
      )}
      {pauseError && <span role="alert" title={t("agents.error", { error: pauseError })} style={{ color: "var(--text-muted)", fontSize: 12 }}>⚠</span>}
      {error && lastOkAt !== null && (vertical ? <span role="status" title={t("agents.rail.stale", { time: new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) })} aria-label={t("agents.rail.stale", { time: new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) })} style={{ color: "var(--text-muted)", fontSize: 12 }}>⚠</span> : <span role="status" style={{ color: "var(--text-muted)", fontSize: 11 }}>{t("agents.rail.stale", { time: new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) })}</span>)}
      <button type="button" onClick={onShowInbox} aria-label={t("agents.rail.inbox")} title={t("agents.rail.inbox")} style={{ ...railButtonStyle, ...(vertical ? { marginTop: "auto" } : { marginLeft: "auto", width: "auto" }) }}>📥{inboxUnread > 0 && <span style={{ fontSize: 12, marginLeft: 2 }}>{inboxUnread}</span>}{!vertical && <span style={{ fontSize: 12, marginLeft: 4 }}>{t("agents.rail.inbox")}</span>}</button>
      <button type="button" onClick={onShowTasks} aria-label={t("agents.rail.tasks")} title={t("agents.rail.tasks")} style={vertical ? railButtonStyle : { ...railButtonStyle, width: "auto" }}>⧉{!vertical && <span style={{ fontSize: 12, marginLeft: 4 }}>{t("agents.rail.tasks")}</span>}</button>
      <button type="button" onClick={onShowSessions} aria-label={t("agents.rail.sessions")} title={t("agents.rail.sessions")} aria-pressed={activeAgent === null} style={{ ...railButtonStyle, color: activeAgent === null ? "var(--accent)" : "var(--text-muted)" }}>☰</button>
    </nav>
  );
}
