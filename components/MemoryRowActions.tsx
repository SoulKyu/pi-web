"use client";

import { type CSSProperties, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentMemoryItem } from "@/lib/agents/memory";
import { requestTaskAction } from "./agents/task-view";

const smallButton: CSSProperties = { padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" };

const saveRequest = (scope: string, text: string, replaces?: string) => requestTaskAction("/api/memory/save", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scope, text, ...(replaces ? { replaces } : {}) }),
});

/** "Promote to user" (non-user scopes) and "Correct" (inline edit, saved in the same scope, the old memory forgotten): both become save requests for pi-mem0's watcher. */
export function MemoryRowActions({ scope, item, onQueued, onError }: { scope: string; item: AgentMemoryItem; onQueued: () => void; onError: (message: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);

  const send = async (targetScope: string, text: string, replaces?: string) => {
    const failure = await saveRequest(targetScope, text, replaces);
    if (failure) { onError(failure); return; }
    setDraft(null);
    onQueued();
  };

  if (draft !== null) {
    return (
      <div style={{ display: "grid", gap: 4, width: "100%" }}>
        <textarea aria-label={t("memory.correct")} value={draft} maxLength={4096} rows={3} onChange={(event) => setDraft(event.target.value)} style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }} />
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" disabled={!draft.trim() || draft.trim() === item.text} onClick={() => void send(scope, draft, item.id)} style={smallButton}>{t("memory.correctSave")}</button>
          <button type="button" onClick={() => setDraft(null)} style={smallButton}>{t("memory.correctCancel")}</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {scope !== "user" && <button type="button" onClick={() => void send("user", item.text)} style={smallButton}>{t("memory.promote")}</button>}
      <button type="button" onClick={() => setDraft(item.text)} style={smallButton}>{t("memory.correct")}</button>
    </div>
  );
}
