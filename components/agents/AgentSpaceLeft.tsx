"use client";

import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { modelLabel, type AgentDetail } from "@/lib/agents/agent-view";
import { FileExplorer } from "../FileExplorer";
import { AgentAvatar } from "./AgentAvatar";
import { AgentProfileDialog } from "./AgentProfileDialog";
import { AgentTriggers } from "./AgentTriggers";

const TRIGGERS_POLL_MS = 10_000;

export function AgentSpaceLeft({ agent, onOpenFile, onOpenSession, onProfileSaved, onDeleted }: {
  agent: AgentDetail;
  onOpenSession: (sessionId: string) => void;
  onOpenFile: ComponentProps<typeof FileExplorer>["onOpenFile"];
  onProfileSaved: (agent: AgentDetail) => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
  const [triggers, setTriggers] = useState<PublicTrigger[]>([]);
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const name = agent.name;

  const load = useCallback(async (signal?: AbortSignal) => {
    // Independent reads: a failing one keeps the last list instead of blanking the section.
    const read = async <T,>(url: string, key: string): Promise<T | null> => {
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        const data = await response.json() as Record<string, unknown>;
        return response.ok && Array.isArray(data[key]) ? data[key] as T : null;
      } catch { return null; }
    };
    const [nextTriggers, nextTasks] = await Promise.all([
      read<PublicTrigger[]>(`/api/agent-ops/triggers?agent=${encodeURIComponent(name)}`, "triggers"),
      read<AgentTaskListItem[]>(`/api/agents/${encodeURIComponent(name)}/tasks`, "tasks"),
    ]);
    if (signal?.aborted) return;
    if (nextTriggers) setTriggers(nextTriggers);
    if (nextTasks) setTasks(nextTasks);
  }, [name]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => void load(controller.signal), TRIGGERS_POLL_MS);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [load]);
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, padding: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <AgentAvatar avatar={agent.avatar} size={22} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{[modelLabel(agent.model), t(`agents.tools.${agent.toolsPreset}`)].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <div className="agent-space-section">{t("agents.space.home")}</div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <FileExplorer cwd={agent.home} onOpenFile={onOpenFile} changesCollapsed />
      </div>
      <div className="agent-space-section">{t("agents.space.triggers")}</div>
      <AgentTriggers agentName={name} triggers={triggers} tasks={tasks} onOpenSession={onOpenSession} onChanged={() => void load()} />
      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        style={{ marginTop: 8, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "none", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
      >
        {t("agents.space.profile")}
      </button>
      {profileOpen && <AgentProfileDialog agent={agent} onClose={() => setProfileOpen(false)} onSaved={onProfileSaved} onDeleted={onDeleted} />}
    </div>
  );
}
