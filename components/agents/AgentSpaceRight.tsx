"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const [error, setError] = useState<string | null>(null);
  const signalRef = useRef<AbortSignal | undefined>(undefined);

  const loadMemory = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.name)}/memory`, { cache: "no-store", signal });
      const data = await response.json() as MemoryState & { error?: string };
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setMemory(data);
      setError(null);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [agent.name]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    signalRef.current = signal;
    setMemory(EMPTY_MEMORY);
    setError(null);
    void loadMemory(signal);
    const timer = setInterval(() => void loadMemory(signal), MEMORY_POLL_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [loadMemory]);

  const reloadMemory = () => void loadMemory(signalRef.current);

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
          <AgentMemory facts={memory.staged} onChanged={reloadMemory} open />
        </>
      )}
      <div className="agent-space-section">{t("agents.space.memory")}</div>
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agents.error", { error })}</div>}
      <AgentMemoryRecent agentName={agent.name} items={memory.recent} pending={memory.pendingForget} onChanged={reloadMemory} />
    </div>
  );
}
