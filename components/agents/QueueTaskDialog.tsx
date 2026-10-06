"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import { backdropStyle, buttonStyle, fieldStyle, formStyle, labelStyle } from "./dialog-styles";

export function QueueTaskDialog({ agentName, onClose, onQueued }: { agentName: string; onClose: () => void; onQueued: () => void }) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentName)}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(data.error ?? `HTTP ${response.status}`); return; }
      onQueued();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const title = t("agents.tasks.queueTitle", { name: agentName });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        <label style={labelStyle}>
          {t("agents.tasks.prompt")}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("agents.tasks.promptPlaceholder")} rows={6} required style={{ ...fieldStyle, resize: "vertical" }} />
          {error && <span role="alert" style={{ color: "var(--text-muted)" }}>{t("agents.error", { error })}</span>}
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !prompt.trim()} style={{ ...buttonStyle, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}>{t("agents.tasks.queue")}</button>
        </div>
      </form>
    </div>
  );
}
