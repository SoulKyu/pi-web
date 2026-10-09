"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import type { AgentDetail } from "@/lib/agents/agent-view";
import type { StagedFactView } from "@/lib/agent-ops/memory-review";
import type { AgentMemoryItem, JournalEvent, Mem0Health } from "@/lib/agents/memory";
import { AgentMemory } from "./AgentMemory";
import { AgentMemoryRecent } from "./AgentMemoryRecent";
import { AgentTasks } from "./AgentTasks";
import { QueueTaskDialog } from "./QueueTaskDialog";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { AgentUsageSummary, UsageBucket } from "@/lib/agents/usage-summary";
import { budgetBars, formatCompact } from "@/lib/agents/format-usage";
import type { AuditLine } from "@/lib/agents/audit";
import type { MemoryMdCommit } from "@/lib/agents/agent-git";

interface MemoryState { recent: AgentMemoryItem[]; events: JournalEvent[]; pendingForget: string[]; staged: StagedFactView[]; health?: Mem0Health }
const EMPTY_MEMORY: MemoryState = { recent: [], events: [], pendingForget: [], staged: [] };
const MEMORY_POLL_MS = 10_000;
const ACTIVE_TASK_POLL_MS = 5_000;


export function AgentSpaceRight({ agent, running, paused, allPaused, contextPercent, onOpenSession, onOpenFile, onPauseChanged }: { agent: AgentDetail; running: boolean; paused: boolean; allPaused: boolean; contextPercent: number | null; onOpenSession: (sessionId: string) => void; onOpenFile: (filePath: string, fileName: string) => void; onPauseChanged: () => void }) {
  const { t } = useI18n();
  const [memory, setMemory] = useState<MemoryState>(EMPTY_MEMORY);

  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [usage, setUsage] = useState<AgentUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditLine[] | null>(null);
  const [memoryHistory, setMemoryHistory] = useState<MemoryMdCommit[] | null>(null);
  const [auditFilter, setAuditFilter] = useState("");
  const [auditBlockedOnly, setAuditBlockedOnly] = useState(false);
  const signalRef = useRef<AbortSignal | undefined>(undefined);

  // One request pair serves both sections; the poll below reads `tasks` through a ref to pick its interval.
  const loadMemory = useCallback(async (signal?: AbortSignal) => {
    const base = `/api/agents/${encodeURIComponent(agent.name)}`;
    try {
      const [memoryResponse, tasksResponse, usageData] = await Promise.all([
        fetch(`${base}/memory`, { cache: "no-store", signal }),
        fetch(`${base}/tasks`, { cache: "no-store", signal }),
        fetch(`${base}/usage`, { cache: "no-store", signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ usage?: AgentUsageSummary } | null>,
      ]);
      const data = await memoryResponse.json() as MemoryState & { error?: string };
      const taskData = await tasksResponse.json() as { tasks?: AgentTaskListItem[]; error?: string };
      if (signal?.aborted) return;
      if (!memoryResponse.ok) throw new Error(data.error ?? `HTTP ${memoryResponse.status}`);
      if (!tasksResponse.ok) throw new Error(taskData.error ?? `HTTP ${tasksResponse.status}`);
      setMemory(data);
      if (usageData?.usage) setUsage(usageData.usage);
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
    setUsage(null);
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
  const pauseButtonStyle = { padding: "2px 10px", borderRadius: 0, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" } as const;

  const bucketLine = (bucket: UsageBucket) => {
    const head = `${t("agents.usage.runs", { runs: bucket.runs })} · ${formatCompact(bucket.tokens)} tok`;
    const parts = [head];
    if (bucket.cost > 0) parts.push(`$${bucket.cost.toFixed(2)}`);
    if (bucket.costEquivalent > 0) parts.push(`≈ $${bucket.costEquivalent.toFixed(2)} ${t("agents.usage.equivalent")}`);
    return parts.join(" · ");
  };
  const budgets = usage ? budgetBars(usage.today, { tokens: agent.budgetTokensPerDay, usd: agent.budgetUsdPerDay }) : [];
  const budgetReached = usage !== null && ((agent.budgetTokensPerDay !== undefined && usage.today.tokens >= agent.budgetTokensPerDay) || (agent.budgetUsdPerDay !== undefined && usage.today.cost >= agent.budgetUsdPerDay));
  const usageHasRuns = usage !== null && usage.days30.runs > 0;

  const loadAudit = () => {
    fetch(`/api/agents/${encodeURIComponent(agent.name)}/audit?limit=50`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { lines: [] }))
      .then((data: { lines?: AuditLine[] }) => setAudit(data.lines ?? []))
      .catch(() => setAudit([]));
  };
  const loadMemoryHistory = () => {
    fetch(`/api/agents/${encodeURIComponent(agent.name)}/memory-md/history`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { commits: [] }))
      .then((data: { commits?: MemoryMdCommit[] }) => setMemoryHistory(data.commits ?? []))
      .catch(() => setMemoryHistory([]));
  };
  const auditShown = (audit ?? []).filter((line) => line.tool.toLowerCase().includes(auditFilter.trim().toLowerCase()) && (!auditBlockedOnly || line.policy));

  const reloadMemory = () => void loadMemory(signalRef.current);

  return (
    <div aria-label={agent.name} style={{ padding: "8px", fontSize: 12, color: "var(--text)" }}>
      <div className="agent-space-section">{t("agents.space.status")}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <span>{running ? `● ${t("agents.space.running")}` : `🟢 ${t("agents.space.idle")}`}</span>
        {contextPercent !== null && <span style={{ color: "var(--text-muted)" }}>{t("agents.space.context", { percent: Math.round(contextPercent) })}</span>}
      </div>
      {usage && usageHasRuns && (
        <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
          {([["today", usage.today], ["days7", usage.days7], ["days30", usage.days30]] as const).map(([key, bucket]) => (
            <div key={key}>{t(`agents.usage.${key}`)}: {bucketLine(bucket)}</div>
          ))}
          {budgets.map((bar) => (
            <label key={bar.kind} className="agent-budget-row">
              <span>{t(bar.kind === "tokens" ? "agents.usage.budgetTokens" : "agents.usage.budgetCost")}</span>
              <progress className="agent-budget-progress" max={bar.max} value={bar.value} />
              <span>{bar.figures}</span>
            </label>
          ))}
          {budgetReached && <div role="status" style={{ color: "var(--text)" }}>{t("agents.usage.budgetReached")}</div>}
          <details>
            <summary style={{ cursor: "pointer" }}>{t("agents.usage.breakdown")}</summary>
            {[...Object.entries(usage.byModel), ...Object.entries(usage.byOrigin)].map(([label, bucket], index) => (
              <div key={`${index}:${label}`}>{label}: {bucketLine(bucket)}</div>
            ))}
          </details>
          {usage.cacheHitRate30d !== null && <div style={{ color: "var(--text-dim)" }}>{t("agents.usage.cacheHit", { percent: Math.round(usage.cacheHitRate30d * 100) })}</div>}
        </div>
      )}
      {allPaused ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 0 }}>
          <span style={{ flex: 1 }}>{t("agentOps.pause.allBanner")}</span>
          <button type="button" onClick={() => void setPaused("all")} style={pauseButtonStyle}>{t("agentOps.pause.resume")}</button>
        </div>
      ) : paused ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 0 }}>
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
      <button type="button" onClick={() => setQueueOpen(true)} style={{ padding: "2px 10px", borderRadius: 0, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer", marginBottom: 6 }}>{t("agents.tasks.queue")}</button>
      {tasks.length === 0 && <div style={{ color: "var(--text-dim)" }}>{t("agents.tasks.none")}</div>}
      {tasks.length > 0 && <AgentTasks tasks={tasks} compact onOpenSession={onOpenSession} onChanged={reloadMemory} />}
      {agent.memoryMd && (
        <>
          <div className="agent-space-section">{t("agents.space.knowledge")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>MEMORY.md ({(agent.memoryMd.size / 1024).toFixed(1)} KB)</span>
            <button type="button" onClick={() => onOpenFile(`${agent.home}/MEMORY.md`, "MEMORY.md")} style={{ padding: "2px 10px", borderRadius: 0, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" }}>{t("agents.space.knowledgeOpen")}</button>
          </div>
          <details onToggle={(event) => { if (event.currentTarget.open && memoryHistory === null) loadMemoryHistory(); }}>
            <summary style={{ cursor: "pointer" }}>{t("agents.space.memoryHistory")}</summary>
            {memoryHistory !== null && memoryHistory.length === 0 && <div style={{ color: "var(--text-dim)" }}>{t("agents.space.memoryHistoryNone")}</div>}
            {(memoryHistory ?? []).map((commit) => (
              <details key={commit.hash} style={{ borderTop: "1px solid var(--border)", padding: "3px 0" }}>
                <summary style={{ cursor: "pointer" }}>
                  <span style={{ color: "var(--text-dim)" }}>{new Date(commit.date).toLocaleString()}</span> {commit.subject}
                </summary>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{commit.patch}</pre>
                {commit.truncated && <div style={{ color: "var(--text-dim)" }}>{t("agents.space.memoryHistoryTruncated")}</div>}
              </details>
            ))}
          </details>
        </>
      )}
      <div className="agent-space-section">{t("agents.space.audit")}</div>
      <details onToggle={(event) => { if (event.currentTarget.open && audit === null) loadAudit(); }}>
        <summary style={{ cursor: "pointer" }}>{t("agents.space.auditHint")}</summary>
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0" }}>
          <input value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)} placeholder={t("agents.space.auditFilter")} aria-label={t("agents.space.auditFilter")} style={{ flex: 1, minWidth: 0, fontSize: 11 }} />
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
            <input type="checkbox" checked={auditBlockedOnly} onChange={(event) => setAuditBlockedOnly(event.target.checked)} />{t("agents.space.auditBlockedOnly")}
          </label>
        </div>
        {audit !== null && auditShown.length === 0 && <div style={{ color: "var(--text-dim)" }}>{t("agents.space.auditNone")}</div>}
        {auditShown.map((line, index) => (
          <div key={`${line.at}-${index}`} style={{ borderTop: "1px solid var(--border)", padding: "3px 0" }}>
            <span style={{ color: "var(--text-dim)" }}>{new Date(line.at).toLocaleString()}</span> <strong>{line.tool}</strong>
            {line.policy && <span style={{ marginLeft: 6, color: "var(--text)" }}>{t("agents.space.auditBlocked", { policy: line.policy })}</span>}
            {line.durationMs !== undefined && <span style={{ marginLeft: 6, color: "var(--text-dim)" }}>{line.durationMs} ms</span>}
            {line.isError && !line.policy && <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>{t("agents.space.auditError")}</span>}
            <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{line.args}</code>
          </div>
        ))}
      </details>
      <div className="agent-space-section">{t("agents.space.memory")}</div>
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agents.error", { error })}</div>}
      <AgentMemoryRecent agentName={agent.name} items={memory.recent} events={memory.events} onOpenSession={onOpenSession} pending={memory.pendingForget} health={memory.health} onChanged={reloadMemory} />
      {queueOpen && typeof document !== "undefined" && createPortal(<QueueTaskDialog agentName={agent.name} onClose={() => setQueueOpen(false)} onQueued={reloadMemory} />, document.body)}
    </div>
  );
}
