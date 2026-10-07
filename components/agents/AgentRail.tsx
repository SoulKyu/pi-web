"use client";

import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import type { AgentOpsHealth } from "@/lib/agent-ops/health";
import { AgentAvatar } from "./AgentAvatar";

type HealthLevel = "ok" | "warn" | "down";
const HEALTH_COLORS: Record<HealthLevel, string> = { ok: "#3fb950", warn: "#d29922", down: "#f85149" };

/** Polls the internal health gauges every 30 s while the tab is visible; null until the first answer or when the route fails. */
function useHealthPoll(): { health: AgentOpsHealth; level: HealthLevel } | null {
  const [state, setState] = useState<{ health: AgentOpsHealth; level: HealthLevel } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/agent-ops/health", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { health?: AgentOpsHealth; level?: HealthLevel };
        setState(response.ok && data.health && data.level ? { health: data.health, level: data.level } : null);
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
export function useAgentsPoll(): { agents: AgentListItem[]; agentsHomeDir?: string; paused: boolean; error: string | null; reload: () => void } {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [agentsHomeDir, setAgentsHomeDir] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return { agents, agentsHomeDir, paused, error, reload };
}

const railButtonStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, padding: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, fontSize: 16 };

export function AgentRail({ agents, activeAgent, onSelectAgent, onNewAgent, onShowSessions, orientation, paused, onPauseChanged }: {
  agents: readonly AgentListItem[];
  activeAgent: string | null;
  onSelectAgent: (name: string) => void;
  onNewAgent: () => void;
  onShowSessions: () => void;
  orientation: "vertical" | "horizontal";
  paused: boolean;
  onPauseChanged: () => void;
}) {
  const { t } = useI18n();
  const vertical = orientation === "vertical";
  const healthState = useHealthPoll();
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
  const [pauseError, setPauseError] = useState<string | null>(null);
  const togglePause = async () => {
    if (!paused && !window.confirm(t("agentOps.pause.confirm"))) return;
    try {
      const response = await fetch("/api/agent-ops/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !paused }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? `HTTP ${response.status}`);
      setPauseError(null);
    } catch (cause) {
      setPauseError(cause instanceof Error ? cause.message : String(cause));
    } finally { onPauseChanged(); }
  };
  return (
    <nav aria-label={t("agents.rail")} className={vertical ? "agent-rail" : "agent-rail agent-rail-horizontal"}>
      {agents.map((agent) => (
        <button
          key={agent.name}
          type="button"
          onClick={() => onSelectAgent(agent.name)}
          aria-current={agent.name === activeAgent ? "true" : undefined}
          aria-label={[agent.name, agent.unread > 0 ? t("agents.rail.unread", { count: agent.unread }) : "", agent.running ? t("agents.rail.running") : ""].filter(Boolean).join(", ")}
          title={agent.name}
          style={{ ...railButtonStyle, borderRadius: "50%" }}
        >
          <AgentAvatar avatar={agent.avatar} running={agent.running} unread={agent.unread} selected={agent.name === activeAgent} title={agent.name} />
        </button>
      ))}
      <button type="button" onClick={onNewAgent} aria-label={t("agents.rail.new")} title={t("agents.rail.new")} style={railButtonStyle}>+</button>
      {healthState && <span role="img" aria-label={t(`agents.health.${healthState.level}`)} title={healthTitle ?? undefined} style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: HEALTH_COLORS[healthState.level] }} />}
      {healthState?.health.quietHours && <span role="img" aria-label={t("agentOps.quietHours.active")} title={t("agentOps.quietHours.active")} style={{ fontSize: 12 }}>🌙</span>}
      <button type="button" onClick={() => void togglePause()} aria-label={paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")} title={paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")} aria-pressed={paused} style={{ ...railButtonStyle, color: paused ? "var(--accent)" : "var(--text-muted)" }}>{paused ? "▶" : "⏸"}</button>
      {pauseError && <span role="alert" title={t("agents.error", { error: pauseError })} style={{ color: "var(--text-muted)", fontSize: 12 }}>⚠</span>}
      <button type="button" onClick={onShowSessions} aria-label={t("agents.rail.sessions")} title={t("agents.rail.sessions")} aria-pressed={activeAgent === null} style={{ ...railButtonStyle, ...(vertical ? { marginTop: "auto" } : { marginLeft: "auto" }), color: activeAgent === null ? "var(--accent)" : "var(--text-muted)" }}>☰</button>
    </nav>
  );
}
