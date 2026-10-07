"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentMemoryItem, Mem0Health } from "@/lib/agents/memory";
import { formatRelativeTime } from "@/lib/i18n/format";
import { ConfigButton, ConfigDetail, ConfigEmptyState, ConfigFooter, ConfigFooterStatus, ConfigNotice, ConfigPanelShell } from "./SettingsUi";

interface MemoryResponse {
  items: AgentMemoryItem[];
  scopes: { user: boolean; projects: { id: string; label: string }[]; agents: string[] };
  health?: Mem0Health;
  error?: string;
}
const WATCHER_STALE_MS = 2 * 60 * 1000;

/** Settings › Memory: pi-mem0 snapshots of the user, project and agent scopes; forget requests wait for pi-mem0's watcher. */
export function MemoryConfig({ embedded = false, onClose }: { embedded?: boolean; onClose: () => void }) {
  const { locale, t } = useI18n();
  const [scope, setScope] = useState("user");
  const [data, setData] = useState<MemoryResponse | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [now, setNow] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/memory?scope=${encodeURIComponent(scope)}`, { cache: "no-store", signal });
      const body = await response.json() as MemoryResponse;
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setData(body);
      setError(null);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    setSelected(new Set());
    setQueued(0);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [data?.health]);

  const items = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => !needle || item.text.toLowerCase().includes(needle));
  }, [data, filter]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const forgetSelected = async () => {
    const memoryIds = [...selected];
    if (memoryIds.length === 0 || !window.confirm(t("memory.forgetConfirm", { count: memoryIds.length }))) return;
    try {
      const response = await fetch("/api/memory/forget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, memoryIds }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setQueued(memoryIds.length);
      setSelected(new Set());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const health = data?.health;
  const watcherAge = health?.watcherAt ? now - Date.parse(health.watcherAt) : Infinity;
  const scopes = data?.scopes;
  return (
    <ConfigPanelShell embedded={embedded} title={t("settings.memory")} closeLabel={t("i18n.close")} onClose={onClose}>
      {data && !(watcherAge <= WATCHER_STALE_MS) && <ConfigNotice>{t("agents.memory.watcherStale")}</ConfigNotice>}
      {health?.lastCaptureError && <ConfigNotice>{t("agents.memory.captureError", { error: health.lastCaptureError })}</ConfigNotice>}
      <ConfigDetail>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <select aria-label={t("memory.scope")} value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="user">{t("memory.scopeUser")}</option>
            {scopes && scopes.projects.length > 0 && (
              <optgroup label={t("memory.scopeProjects")}>
                {scopes.projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.label}</option>)}
              </optgroup>
            )}
            {scopes && scopes.agents.length > 0 && (
              <optgroup label={t("memory.scopeAgents")}>
                {scopes.agents.map((name) => <option key={name} value={`agent:${name}`}>{name}</option>)}
              </optgroup>
            )}
          </select>
          <input type="search" aria-label={t("memory.filter")} placeholder={t("memory.filter")} value={filter} onChange={(event) => setFilter(event.target.value)} style={{ flex: 1, minWidth: 120 }} />
        </div>
        {items.length === 0 ? <ConfigEmptyState>{t("memory.none")}</ConfigEmptyState> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item) => (
              <li key={item.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                <input type="checkbox" aria-label={item.text} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "var(--text)" }}>{item.text}</div>
                  <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
                    <span>{formatRelativeTime(item.createdAt, locale)}</span>
                    <span style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "0 6px" }}>{item.source}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ConfigDetail>
      <ConfigFooter status={error
        ? <ConfigFooterStatus tone="error" summary={t("memory.error", { error })} />
        : queued > 0 ? <ConfigFooterStatus summary={t("memory.queued", { count: queued })} /> : undefined}>
        <ConfigButton variant="danger" disabled={selected.size === 0} onClick={() => void forgetSelected()}>
          {t("memory.forgetSelected", { count: selected.size })}
        </ConfigButton>
      </ConfigFooter>
    </ConfigPanelShell>
  );
}
