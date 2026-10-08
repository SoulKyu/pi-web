"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { InboxItem } from "@/lib/agents/inbox";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { AgentAvatar } from "./AgentAvatar";
import { backdropStyle, buttonStyle } from "./dialog-styles";

const REFRESH_MS = 10_000;
const ICONS: Record<InboxItem["kind"], string> = { card: "◆", reply: "💬", task: "✓", approval: "❓" };

interface InboxGroup { name: string; avatar: AgentListItem["avatar"]; unread: number; items: InboxItem[] }

export function InboxPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (name: string, entryId?: string) => void }) {
  const { t, locale } = useI18n();
  const [groups, setGroups] = useState<InboxGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/agents/inbox", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { agents?: InboxGroup[]; error?: string };
        if (!response.ok || !data.agents) throw new Error(data.error ?? `HTTP ${response.status}`);
        setGroups(data.agents);
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  const title = t("agents.inbox.title");
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <div style={{ width: "min(560px, 100%)", display: "grid", gap: 12, padding: 16, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 0, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, marginLeft: "auto", border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" }}>{t("agents.close")}</button>
        </div>
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agents.error", { error })}</div>}
        {groups?.length === 0 && !error && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("agents.inbox.empty")}</div>}
        {groups?.map((group) => (
          <section key={group.name} aria-label={group.name} style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AgentAvatar avatar={group.avatar} size={22} />
              <strong style={{ fontSize: 13, color: "var(--text)" }}>{group.name}</strong>
            </div>
            {group.items.map((item, index) => (
              <button key={`${item.entryId ?? item.kind}-${index}`} type="button" onClick={() => onOpen(group.name, item.entryId)} style={{ display: "flex", gap: 8, alignItems: "baseline", textAlign: "left", padding: "4px 6px", background: "none", border: "none", borderRadius: 0, color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
                <span aria-hidden>{ICONS[item.kind]}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.kind === "approval" ? t("agents.inbox.approval") : item.title}{item.detail ? ` (${item.detail})` : ""}</span>
                <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>· {formatRelativeTime(item.at, locale)}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
