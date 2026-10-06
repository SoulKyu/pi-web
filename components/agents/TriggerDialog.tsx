"use client";

import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { backdropStyle, buttonStyle, fieldStyle, formStyle } from "./dialog-styles";
import { requestTrigger, type TriggerResponse } from "./trigger-view";

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" };
const MS_PER_MINUTE = 60_000;

/** Creates a trigger of `agentName`, or edits `trigger`. The run happens in the agent home. */
export function TriggerDialog({ trigger, agentName, onClose, onSaved }: {
  trigger?: PublicTrigger;
  agentName: string;
  onClose: () => void;
  onSaved: (response: Partial<TriggerResponse>) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(trigger?.name ?? "");
  const [promptTemplate, setPromptTemplate] = useState(trigger?.promptTemplate ?? "");
  const [everyMinutes, setEveryMinutes] = useState(trigger?.everyMinutes?.toString() ?? "");
  const [webhook, setWebhook] = useState(false);
  const [dedupMinutes, setDedupMinutes] = useState(String((trigger?.dedupWindowMs ?? 15 * MS_PER_MINUTE) / MS_PER_MINUTE));
  const [maxActiveTasks, setMaxActiveTasks] = useState(String(trigger?.maxActiveTasks ?? 1));
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
    const fields = {
      name: name.trim(), profile: agentName, promptTemplate,
      dedupWindowMs: Number(dedupMinutes) * MS_PER_MINUTE, maxActiveTasks: Number(maxActiveTasks),
    };
    const every = everyMinutes.trim() ? Number(everyMinutes) : undefined;
    const result = await requestTrigger(trigger ? `/api/agent-ops/triggers/${trigger.id}` : "/api/agent-ops/triggers", {
      method: trigger ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trigger ? { ...fields, everyMinutes: every ?? null } : { ...fields, everyMinutes: every, webhook }),
    });
    setBusy(false);
    if ("error" in result) { setError(result.error); return; }
    onSaved(result.data);
    onClose();
  };

  const title = trigger ? t("agentOps.trigger.editTitle", { name: trigger.name }) : t("agentOps.trigger.new");
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        <label style={labelStyle}>
          {t("agentOps.trigger.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} required style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          {t("agentOps.trigger.promptTemplate")}
          <textarea value={promptTemplate} onChange={(event) => setPromptTemplate(event.target.value)} required rows={5} placeholder={t("agentOps.trigger.promptPlaceholder")} style={{ ...fieldStyle, fontFamily: "inherit", resize: "vertical" }} />
        </label>
        <label style={labelStyle}>
          {t("agentOps.trigger.everyMinutes")}
          <input type="number" min={1} step={1} value={everyMinutes} onChange={(event) => setEveryMinutes(event.target.value)} style={fieldStyle} />
        </label>
        {!trigger && (
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={webhook} onChange={(event) => setWebhook(event.target.checked)} />
            {t("agentOps.trigger.webhookField")}
          </label>
        )}
        <label style={labelStyle}>
          {t("agentOps.trigger.dedupMinutes")}
          <input type="number" min={1} step="any" value={dedupMinutes} onChange={(event) => setDedupMinutes(event.target.value)} required style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          {t("agentOps.trigger.maxActive")}
          <input type="number" min={1} step={1} value={maxActiveTasks} onChange={(event) => setMaxActiveTasks(event.target.value)} required style={fieldStyle} />
        </label>
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agentOps.actionFailed", { error })}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !name.trim() || !promptTemplate.trim()} style={{ ...buttonStyle, border: 0, background: "var(--accent)", color: "var(--accent-contrast)", fontWeight: 600 }}>
            {busy ? t("agentOps.trigger.saving") : trigger ? t("agentOps.trigger.save") : t("agentOps.trigger.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
