"use client";

import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { modelLabel, type AgentDetail } from "@/lib/agents/agent-view";
import { FileExplorer, type FileExplorerHandle } from "../FileExplorer";
import { AgentAvatar } from "./AgentAvatar";
import { AgentProfileForm } from "./AgentProfileForm";
import { AgentTriggers } from "./AgentTriggers";

const TRIGGERS_POLL_MS = 10_000;

export function AgentSpaceLeft({ agent, onOpenFile, onOpenSession, onProfileSaved, onDeleted, onThreadReset }: {
  agent: AgentDetail;
  onOpenSession: (sessionId: string) => void;
  onOpenFile: ComponentProps<typeof FileExplorer>["onOpenFile"];
  onProfileSaved: (agent: AgentDetail) => void;
  onDeleted: () => void;
  onThreadReset: () => void;
}) {
  const { t } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [triggers, setTriggers] = useState<PublicTrigger[]>([]);
  const [tasks, setTasks] = useState<AgentTaskListItem[]>([]);
  const explorerRef = useRef<FileExplorerHandle>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="agent-space-section">{t("agents.space.home")}</div>
        <button
          type="button"
          onClick={() => explorerRef.current?.openUploadPicker()}
          disabled={uploadBusy}
          title={t("agents.space.browse")}
          aria-label={t("agents.space.browse")}
          style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--text-dim)", opacity: uploadBusy ? 0.5 : 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m17 8-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <FileExplorer ref={explorerRef} cwd={agent.home} onOpenFile={onOpenFile} onUploadBusyChange={setUploadBusy} changesCollapsed />
      </div>
      <div className="agent-space-section">{t("agents.space.triggers")}</div>
      <AgentTriggers agentName={name} triggers={triggers} tasks={tasks} onOpenSession={onOpenSession} onChanged={() => void load()} />
      <button
        type="button"
        onClick={() => setProfileOpen((open) => !open)}
        style={{ marginTop: 8, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 0, background: "none", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
      >
        {t("agents.space.profile")}
      </button>
      {profileOpen && <AgentProfileForm key={formKey} agent={agent} onSaved={onProfileSaved} onDeleted={onDeleted} onThreadReset={onThreadReset} onDiscard={() => setFormKey((key) => key + 1)} />}
    </div>
  );
}
