"use client";

import { type ComponentProps, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { modelLabel, type AgentDetail } from "@/lib/agents/agent-view";
import { FileExplorer } from "../FileExplorer";
import { AgentAvatar } from "./AgentAvatar";
import { AgentProfileDialog } from "./AgentProfileDialog";

export function AgentSpaceLeft({ agent, onOpenFile, onProfileSaved, onDeleted }: {
  agent: AgentDetail;
  onOpenFile: ComponentProps<typeof FileExplorer>["onOpenFile"];
  onProfileSaved: (agent: AgentDetail) => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
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
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} />
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
