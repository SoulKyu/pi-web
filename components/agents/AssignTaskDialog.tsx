"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import { requestTaskAction } from "./task-view";
import { backdropStyle, buttonStyle, fieldStyle, formStyle } from "./dialog-styles";

export { backdropStyle, buttonStyle, fieldStyle, formStyle };

export function AssignTaskDialog({ profile, displayName, initialCwd, onClose, onAssigned }: {
  profile: string;
  displayName: string;
  initialCwd: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { t } = useI18n();
  const [cwd, setCwd] = useState(initialCwd);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The panel re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const failure = await requestTaskAction("/api/agent-ops/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, cwd: cwd.trim(), prompt }),
    });
    setBusy(false);
    if (failure) { setError(failure); return; }
    onAssigned();
    onClose();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("agentOps.assignTitle", { name: displayName })}
      tabIndex={-1}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={backdropStyle}
    >
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{t("agentOps.assignTitle", { name: displayName })}</strong>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("agentOps.cwd")}
          <input value={cwd} onChange={(event) => setCwd(event.target.value)} required spellCheck={false} style={fieldStyle} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {t("agentOps.prompt")}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required rows={6} placeholder={t("agentOps.promptPlaceholder")} style={{ ...fieldStyle, fontFamily: "inherit", resize: "vertical" }} />
        </label>
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agentOps.actionFailed", { error })}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !cwd.trim() || !prompt.trim()} style={{ ...buttonStyle, border: 0, background: "var(--accent)", color: "var(--accent-contrast)", fontWeight: 600 }}>
            {busy ? t("agentOps.submitting") : t("agentOps.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
