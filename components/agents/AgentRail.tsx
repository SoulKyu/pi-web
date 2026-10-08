"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Inbox, ListTodo, Menu, Moon, Pause, Play, Plus, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/i18n/format";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import type { AgentOpsHealth } from "@/lib/agent-ops/health";
import { samePlannotator, type PlannotatorConfig } from "@/lib/plannotator";
import { AgentAvatar } from "./AgentAvatar";
import { healthPopoverLines, healthPopoverPosition } from "./rail-health";

type HealthLevel = "ok" | "warn" | "down";
export interface HealthState { health: AgentOpsHealth; level: HealthLevel; plannotator: PlannotatorConfig | null }
const HEALTH_COLORS: Record<HealthLevel, string> = { ok: "var(--color-tron-cyan)", warn: "var(--color-tron-orange)", down: "var(--color-tron-red)" };

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

const railButtonClass = "flex size-8 shrink-0 items-center justify-center bg-transparent p-0 text-text-muted outline-none transition-colors hover:text-tron-cyan focus-visible:shadow-glow-cyan [&_svg]:size-4";

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
  const inboxUnread = agents.reduce((sum, agent) => sum + agent.unread, 0);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthPosition, setHealthPosition] = useState<{ top: number; left: number } | null>(null);
  const healthButtonRef = useRef<HTMLButtonElement>(null);
  const healthPopoverRef = useRef<HTMLDivElement>(null);
  const staleTime = error && lastOkAt !== null ? new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) : null;
  const healthLines = healthPopoverLines(healthState, { pauseError, staleTime }, t, (iso) => new Date(iso).toLocaleTimeString(locale));
  const healthLinesKey = healthLines.join("\n");
  const healthLabel = [healthState ? t(`agents.health.${healthState.level}`) : null, pauseError ? t("agents.error", { error: pauseError }) : null].filter(Boolean).join(" · ");
  const closeHealth = useCallback((refocus: boolean) => {
    setHealthOpen(false);
    setHealthPosition(null);
    if (refocus) healthButtonRef.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!healthOpen) return;
    const place = () => {
      const button = healthButtonRef.current;
      const popover = healthPopoverRef.current;
      if (!button || !popover) return;
      const viewport = { width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight };
      setHealthPosition(healthPopoverPosition(button.getBoundingClientRect(), { width: popover.offsetWidth, height: popover.offsetHeight }, viewport, orientation));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [healthOpen, healthLinesKey, orientation]);
  const healthPositioned = healthPosition !== null;
  useEffect(() => {
    if (healthOpen && healthPositioned) healthPopoverRef.current?.focus({ preventScroll: true });
  }, [healthOpen, healthPositioned]);
  useEffect(() => {
    if (healthOpen && !healthState && !pauseError) closeHealth(false);
  }, [healthOpen, healthState, pauseError, closeHealth]);
  useEffect(() => {
    if (!healthOpen) return;
    // On document, so it runs before handleGlobalEscape on window and that one sees defaultPrevented.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeHealth(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (healthPopoverRef.current?.contains(target) || healthButtonRef.current?.contains(target)) return;
      closeHealth(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [healthOpen, closeHealth]);
  const [confirmingPause, setConfirmingPause] = useState(false);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const pauseCancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmingPause) pauseCancelRef.current?.focus(); }, [confirmingPause]);
  const closePauseConfirm = useCallback(() => {
    setConfirmingPause(false);
    requestAnimationFrame(() => pauseButtonRef.current?.focus());
  }, []);
  useEffect(() => { if (paused && confirmingPause) closePauseConfirm(); }, [paused, confirmingPause, closePauseConfirm]);
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
    <>
      <nav aria-label={t("agents.rail.shortcutsHint")} className={vertical ? "agent-rail" : "agent-rail agent-rail-horizontal"}>
        {agents.map((agent, index) => (
          <button
            key={agent.name}
            type="button"
            onClick={() => onSelectAgent(agent.name)}
            aria-current={agent.name === activeAgent ? "true" : undefined}
            aria-label={[agent.name, agent.unread > 0 ? t("agents.rail.unread", { count: agent.unread }) : "", agent.state === "needs_input" ? t("agents.rail.needsInput") : agent.running ? t("agents.rail.running") : agent.state === "failed" ? t("agents.rail.failed") : ""].filter(Boolean).join(", ")}
            title={[agent.name + (index < 9 ? ` · Ctrl+Alt+${index + 1}` : ""), [agent.lastPreview, agent.lastActivityAt && formatRelativeTime(agent.lastActivityAt, locale)].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}
            className={vertical ? cn(railButtonClass, "size-9") : cn(railButtonClass, "h-auto w-auto flex-col gap-0.5 px-0.5")}
          >
            <AgentAvatar avatar={agent.avatar} running={agent.running} state={agent.state} unread={agent.unread} selected={agent.name === activeAgent} title={agent.name} />
            {!vertical && <span className="agent-rail-name" aria-hidden="true">{agent.name}</span>}
          </button>
        ))}
        <button type="button" onClick={onNewAgent} aria-label={t("agents.rail.new")} title={t("agents.rail.new")} className={railButtonClass}><Plus aria-hidden="true" /></button>
        {(healthState || pauseError) && (
          <button
            ref={healthButtonRef}
            type="button"
            onClick={() => (healthOpen ? closeHealth(false) : setHealthOpen(true))}
            aria-haspopup="dialog"
            aria-expanded={healthOpen}
            aria-label={healthLabel}
            title={healthLabel}
            className={cn(railButtonClass, "gap-0.5")}
          >
            {healthState && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: HEALTH_COLORS[healthState.level], boxShadow: `0 0 6px ${HEALTH_COLORS[healthState.level]}` }} />}
            {pauseError && <TriangleAlert aria-hidden="true" className="!size-3 text-tron-orange" />}
          </button>
        )}
        {healthState?.health.quietHours && <span role="img" aria-label={t("agentOps.quietHours.active")} title={t("agentOps.quietHours.active")} className="text-text-dim"><Moon aria-hidden="true" className="size-3" /></span>}
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
            <button type="button" onClick={() => { closePauseConfirm(); void setPausedAll(true); }} aria-label={t("agentOps.pause.confirmYes")} title={t("agentOps.pause.confirm")} className={cn(railButtonClass, !vertical && "w-auto gap-1 px-2 text-xs", "border border-tron-cyan text-tron-cyan")}><Check aria-hidden="true" />{!vertical && <span>{t("agentOps.pause.confirmYes")}</span>}</button>
            <button ref={pauseCancelRef} type="button" onClick={closePauseConfirm} aria-label={t("i18n.cancel")} title={t("i18n.cancel")} className={cn(railButtonClass, !vertical && "w-auto gap-1 px-2 text-xs", "border border-tron-line")}><X aria-hidden="true" />{!vertical && <span>{t("i18n.cancel")}</span>}</button>
          </div>
        ) : (
          <button ref={pauseButtonRef} type="button" onClick={() => (paused ? void setPausedAll(false) : setConfirmingPause(true))} aria-label={paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")} title={paused ? t("agentOps.pause.resumeAll") : t("agentOps.pause.all")} aria-pressed={paused} className={cn(railButtonClass, paused && "text-tron-cyan")}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
        )}
        {pauseError && <span role="alert" className="visually-hidden">{t("agents.error", { error: pauseError })}</span>}
        {error && lastOkAt !== null && (vertical ? <span role="status" title={t("agents.rail.stale", { time: new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) })} aria-label={t("agents.rail.stale", { time: new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) })} className="text-tron-orange"><TriangleAlert aria-hidden="true" className="size-3" /></span> : <span role="status" style={{ color: "var(--text-muted)", fontSize: 11 }}>{t("agents.rail.stale", { time: new Date(lastOkAt).toLocaleTimeString(locale, { timeStyle: "short" }) })}</span>)}
        <button type="button" onClick={onShowInbox} aria-label={t("agents.rail.inbox")} title={t("agents.rail.inbox")} className={cn(railButtonClass, vertical ? "mt-auto" : "ml-auto w-auto")}><Inbox aria-hidden="true" />{inboxUnread > 0 && <span className="ml-0.5 font-mono text-xs text-tron-cyan">{inboxUnread}</span>}{!vertical && <span className="ml-1 text-xs">{t("agents.rail.inbox")}</span>}</button>
        <button type="button" onClick={onShowTasks} aria-label={t("agents.rail.tasks")} title={t("agents.rail.tasks")} className={cn(railButtonClass, !vertical && "w-auto")}><ListTodo aria-hidden="true" />{!vertical && <span className="ml-1 text-xs">{t("agents.rail.tasks")}</span>}</button>
        <button type="button" onClick={onShowSessions} aria-label={t("agents.rail.sessions")} title={t("agents.rail.sessions")} aria-pressed={activeAgent === null} className={cn(railButtonClass, activeAgent === null && "text-tron-cyan")}><Menu aria-hidden="true" /></button>
      </nav>
      {healthOpen && createPortal(
        <div
          ref={healthPopoverRef}
          role="dialog"
          aria-label={t("agents.health.title")}
          tabIndex={-1}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !healthPopoverRef.current?.contains(next) && !healthButtonRef.current?.contains(next)) closeHealth(false);
          }}
          style={{
            position: "fixed",
            top: healthPosition?.top ?? 0,
            left: healthPosition?.left ?? 0,
            visibility: healthPosition ? "visible" : "hidden",
            zIndex: 400,
            width: "max-content",
            maxWidth: "min(320px, calc(100vw - 16px))",
            padding: "8px 10px",
            border: "1px solid var(--color-tron-line)",
            borderRadius: 0,
            background: "#000",
            color: "var(--text)",
            boxShadow: "var(--shadow-glow-cyan)",
            fontSize: 12,
          }}
        >
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {healthLines.map((line, index) => (
              <li key={index} className={index === 0 ? "font-hud text-[10px] uppercase tracking-[0.14em] text-tron-cyan" : "text-text-muted"} style={{ overflowWrap: "anywhere" }}>{line}</li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
