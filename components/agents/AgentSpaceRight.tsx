"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentDetail } from "@/lib/agents/agent-view";
import type { StagedFactView } from "@/lib/agent-ops/memory-review";
import type { AgentMemoryItem } from "@/lib/agents/memory";
import { AgentMemory } from "./AgentMemory";
import { AgentMemoryRecent } from "./AgentMemoryRecent";
import { AgentTasks } from "./AgentTasks";
import { QueueTaskDialog } from "./QueueTaskDialog";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";

interface MemoryState { recent: AgentMemoryItem[]; pendingForget: string[]; staged: StagedFactView[] }
const EMPTY_MEMORY: MemoryState = { recent: [], pendingForget: [], staged: [] };
const MEMORY_POLL_MS = 10_000;
const ACTIVE_TASK_POLL_MS = 5_000;

export function AgentSpaceRight({ agent, running, paused, allPaused, contextPercent, onOpenSession, onPauseChanged }: { agent: AgentDetail; running: boolean; paused: boolean; allPaused: boolean; contextPercent: number | null; onOpenSession: (sessionId: string) => void; onPauseChanged: () => void }) {
  const { t } = useI18n();
  const [memory, setMemory] = useState<MemoryState>(EMPTY_MEMORY);

  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signalRef = useRef<AbortSignal | undefined>(undefined);

  // One request pair serves both sections; the poll below reads `tasks` through a ref to pick its interval.
  const loadMemory = useCallback(async (signal?: AbortSignal) => {
    const base = `/api/agents/${encodeURIComponent(agent.name)}`;
    try {
      const [memoryResponse, tasksResponse] = await Promise.all([
        fetch(`${base}/memory`, { cache: "no-store", signal }),
        fetch(`${base}/tasks`, { cache: "no-store", signal }),
      ]);
      const data = await memoryResponse.json() as MemoryState & { error?: string };
      const taskData = await tasksResponse.json() as { tasks?: AgentTaskListItem[]; error?: string };
      if (signal?.aborted) return;
      if (!memoryResponse.ok) throw new Error(data.error ?? `HTTP ${memoryResponse.status}`);
      if (!tasksResponse.ok) throw new Error(taskData.error ?? `HTTP ${tasksResponse.status}`);
      setMemory(data);
      setTasks(taskData.tasks ?? []);
      setError(null);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [agent.name]);

  const tasksActiveRef = useRef(false);
  tasksActiveRef.current = tasks.some((task) => task.status === "queued" || task.status === "running");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    signalRef.current = signal;
    setMemory(EMPTY_MEMORY);
    setTasks([]);
    setError(null);
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await loadMemory(signal);
      if (!signal.aborted) timer = setTimeout(() => void tick(), tasksActiveRef.current ? ACTIVE_TASK_POLL_MS : MEMORY_POLL_MS);
    };
    void tick();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [loadMemory]);

  const setPaused = async (pause: boolean | "all") => {
    try {
      let body: object = { paused: false };
      if (pause !== "all") {
        const current = await (await fetch("/api/agent-ops/settings", { cache: "no-store" })).json() as { settings?: { pausedAgents: string[] } };
        const others = (current.settings?.pausedAgents ?? []).filter((name) => name !== agent.name);
        body = { pausedAgents: pause ? [...others, agent.name] : others };
      }
      const response = await fetch("/api/agent-ops/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? `HTTP ${response.status}`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { onPauseChanged(); }
  };
  const pauseButtonStyle = { padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" } as const;

  const reloadMemory = () => void loadMemory(signalRef.current);

  return (
    <div aria-label={agent.name} style={{ padding: "8px", fontSize: 12, color: "var(--text)" }}>
      <div className="agent-space-section">{t("agents.space.status")}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <span>{running ? `● ${t("agents.space.running")}` : `🟢 ${t("agents.space.idle")}`}</span>
        {contextPercent !== null && <span style={{ color: "var(--text-muted)" }}>{t("agents.space.context", { percent: Math.round(contextPercent) })}</span>}
      </div>
      {allPaused ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6 }}>
          <span style={{ flex: 1 }}>{t("agentOps.pause.allBanner")}</span>
          <button type="button" onClick={() => void setPaused("all")} style={pauseButtonStyle}>{t("agentOps.pause.resume")}</button>
        </div>
      ) : paused ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6 }}>
          <span style={{ flex: 1 }}>{t("agentOps.pause.banner", { name: agent.name })}</span>
          <button type="button" onClick={() => void setPaused(false)} style={pauseButtonStyle}>{t("agentOps.pause.resume")}</button>
        </div>
      ) : (
        <button type="button" onClick={() => void setPaused(true)} style={{ ...pauseButtonStyle, marginTop: 6 }}>{t("agentOps.pause.agent")}</button>
      )}
      {memory.staged.length > 0 && (
        <>
          <div className="agent-space-section">{t("agents.space.memoryToApprove")}</div>
          <AgentMemory facts={memory.staged} onChanged={reloadMemory} open />
        </>
      )}
      <div className="agent-space-section">{t("agents.space.tasks")}</div>
      <button type="button" onClick={() => setQueueOpen(true)} style={{ padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer", marginBottom: 6 }}>{t("agents.tasks.queue")}</button>
      {tasks.length === 0 && <div style={{ color: "var(--text-dim)" }}>{t("agents.tasks.none")}</div>}
      {tasks.length > 0 && <AgentTasks tasks={tasks} compact onOpenSession={onOpenSession} onChanged={reloadMemory} />}
      <div className="agent-space-section">{t("agents.space.memory")}</div>
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agents.error", { error })}</div>}
      <AgentMemoryRecent agentName={agent.name} items={memory.recent} pending={memory.pendingForget} onChanged={reloadMemory} />
      {queueOpen && <QueueTaskDialog agentName={agent.name} onClose={() => setQueueOpen(false)} onQueued={reloadMemory} />}
    </div>
  );
}
