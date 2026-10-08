"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { AgentAvatar } from "./AgentAvatar";
import { AgentTasks } from "./AgentTasks";
import { backdropStyle, buttonStyle } from "./dialog-styles";

const OTHER = "";
const REFRESH_MS = 5_000;

export function TasksBoard({ agents, onClose, onSelectAgent, onOpenSession }: {
  agents: readonly AgentListItem[];
  onClose: () => void;
  onSelectAgent: (name: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/agent-ops/tasks", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { tasks?: AgentTaskListItem[]; truncated?: boolean; error?: string };
        if (!response.ok || !data.tasks) throw new Error(data.error ?? `HTTP ${response.status}`);
        setTasks(data.tasks);
        setTruncated(data.truncated === true);
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [reloadTick]);

  const groups = new Map<string, AgentTaskListItem[]>();
  for (const task of tasks) {
    const key = task.agent ?? OTHER;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const title = t("agents.board.title");
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <div style={{ width: "min(760px, 100%)", display: "grid", gap: 12, padding: 16, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 0, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, marginLeft: "auto", border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" }}>{t("agents.close")}</button>
        </div>
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agents.error", { error })}</div>}
        {tasks.length === 0 && !error && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("agentOps.noTasks")}</div>}
        {[...groups].map(([key, groupTasks]) => {
          const agent = agents.find((candidate) => candidate.name === key);
          return (
            <section key={key} aria-label={key || t("agents.board.other")} style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {agent && <AgentAvatar avatar={agent.avatar} size={22} />}
                <strong style={{ fontSize: 13, color: "var(--text)" }}>{key || t("agents.board.other")}</strong>
              </div>
              <AgentTasks tasks={groupTasks} nested onOpenSession={onOpenSession} onChanged={reload} onSelectAgent={onSelectAgent} />
            </section>
          );
        })}
        {truncated && <div style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("agents.board.truncated")}</div>}
      </div>
    </div>
  );
}
