"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentDetail } from "@/lib/agents/agent-view";
import type { StagedFactView } from "@/lib/agent-ops/memory-review";
import type { AgentMemoryItem } from "@/lib/agents/memory";
import { AgentMemory } from "./AgentMemory";
import { AgentMemoryRecent } from "./AgentMemoryRecent";

interface MemoryState { recent: AgentMemoryItem[]; pendingForget: string[]; staged: StagedFactView[] }
const EMPTY_MEMORY: MemoryState = { recent: [], pendingForget: [], staged: [] };
const MEMORY_POLL_MS = 10_000;

// Tasks (Task 17) mount below the memory sections.
export function AgentSpaceRight({ agent, running, contextPercent }: { agent: AgentDetail; running: boolean; contextPercent: number | null }) {
  const { t } = useI18n();
  const [memory, setMemory] = useState<MemoryState>(EMPTY_MEMORY);

  const loadMemory = useCallback(async () => {
    const [result] = await Promise.allSettled([fetch(`/api/agents/${encodeURIComponent(agent.name)}/memory`, { cache: "no-store" })]);
    if (result.status !== "fulfilled" || !result.value.ok) return;
    setMemory(await result.value.json() as MemoryState);
  }, [agent.name]);

  useEffect(() => {
    setMemory(EMPTY_MEMORY);
    void loadMemory();
    const timer = setInterval(() => void loadMemory(), MEMORY_POLL_MS);
    return () => clearInterval(timer);
  }, [loadMemory]);

  return (
    <div aria-label={agent.name} style={{ padding: "8px", fontSize: 12, color: "var(--text)" }}>
      <div className="agent-space-section">{t("agents.space.status")}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <span>{running ? `● ${t("agents.space.running")}` : `🟢 ${t("agents.space.idle")}`}</span>
        {contextPercent !== null && <span style={{ color: "var(--text-muted)" }}>{t("agents.space.context", { percent: Math.round(contextPercent) })}</span>}
      </div>
      {memory.staged.length > 0 && (
        <>
          <div className="agent-space-section">{t("agents.space.memoryToApprove")}</div>
          <AgentMemory facts={memory.staged} onChanged={() => void loadMemory()} open />
        </>
      )}
      <div className="agent-space-section">{t("agents.space.memory")}</div>
      <AgentMemoryRecent agentName={agent.name} items={memory.recent} pending={memory.pendingForget} onChanged={() => void loadMemory()} />
    </div>
  );
}
