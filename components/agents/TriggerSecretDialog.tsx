"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { openStackedDialog } from "@/lib/stacked-dialog";
import { backdropStyle, buttonStyle, fieldStyle, formStyle } from "./AssignTaskDialog";
import { HOOK_SECRET_HEADER } from "../../lib/agent-ops/hook-path";
import { hookCurl, hookUrl } from "./trigger-view";

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" };

function CopyField({ label, value, rows }: { label: string; value: string; rows?: number }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = () => { void copyText(value).then(() => setCopied(true), () => setCopied(false)); };
  return (
    <div style={labelStyle}>
      <span>{label}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        {rows
          ? <textarea readOnly rows={rows} value={value} onFocus={(event) => event.currentTarget.select()} style={{ ...fieldStyle, resize: "none", whiteSpace: "pre" }} />
          : <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} style={fieldStyle} />}
        <button type="button" onClick={copy} style={{ ...buttonStyle, padding: "6px 10px", border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", flexShrink: 0 }}>
          {copied ? t("i18n.copied") : t("i18n.copy")}
        </button>
      </div>
    </div>
  );
}

/** Shows a freshly generated webhook secret. The server never returns it again; closing the dialog drops it from memory. */
export function TriggerSecretDialog({ triggerId, triggerName, secret, onClose }: {
  triggerId: string;
  triggerName: string;
  secret: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);
  const title = t("agentOps.trigger.secretTitle", { name: triggerName });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={backdropStyle}>
      <div style={{ ...formStyle, width: "min(560px, 100%)" }}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        <div role="alert" style={{ fontSize: 12, color: "var(--text)" }}>{t("agentOps.trigger.secretNote")}</div>
        <CopyField label={t("agentOps.trigger.secret")} value={secret} />
        <CopyField label={t("agentOps.trigger.hookUrl")} value={hookUrl(window.location.origin, triggerId)} />
        <CopyField label={t("agentOps.trigger.header")} value={HOOK_SECRET_HEADER} />
        <CopyField label={t("agentOps.trigger.example")} value={hookCurl(window.location.origin, triggerId, secret)} rows={4} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: 0, background: "var(--accent)", color: "var(--accent-contrast)", fontWeight: 600 }}>{t("i18n.close")}</button>
        </div>
      </div>
    </div>
  );
}
