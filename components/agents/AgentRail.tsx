"use client";

import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { AgentAvatar } from "./AgentAvatar";

/** Polls the agent list: the running dot and the unread badge must move, so 5 s while the tab is visible, 30 s hidden. */
export function useAgentsPoll(): { agents: AgentListItem[]; error: string | null; reload: () => void } {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/agents", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { agents?: AgentListItem[]; error?: string };
        if (!response.ok || !data.agents) throw new Error(data.error ?? `HTTP ${response.status}`);
        setAgents(data.agents);
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

  return { agents, error, reload };
}

const railButtonStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, padding: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, fontSize: 16 };

export function AgentRail({ agents, activeAgent, onSelectAgent, onNewAgent, onShowSessions, orientation }: {
  agents: readonly AgentListItem[];
  activeAgent: string | null;
  onSelectAgent: (name: string) => void;
  onNewAgent: () => void;
  onShowSessions: () => void;
  orientation: "vertical" | "horizontal";
}) {
  const { t } = useI18n();
  const vertical = orientation === "vertical";
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
      <button type="button" onClick={onShowSessions} aria-label={t("agents.rail.sessions")} title={t("agents.rail.sessions")} aria-pressed={activeAgent === null} style={{ ...railButtonStyle, ...(vertical ? { marginTop: "auto" } : { marginLeft: "auto" }), color: activeAgent === null ? "var(--accent)" : "var(--text-muted)" }}>☰</button>
    </nav>
  );
}
