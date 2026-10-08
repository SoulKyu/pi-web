"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import { backdropStyle, buttonStyle, fieldStyle, formStyle, labelStyle } from "./dialog-styles";
import { clipQuote, type HandTarget, QUOTE_MAX, queueErrorKey, reviewExcerpt } from "./queue-task-view";

const REVIEW_TOOLS = ["read", "grep", "find", "ls", "memory_search"];
// Mirrors PROMPT_MAX in app/api/agents/[name]/tasks/route.ts, counted the same way (prompt.length); the route stays authoritative.
const PROMPT_MAX = 20_000;
const ERROR_COLOR = "var(--color-tron-red)";

/** `targetAgents`, `quote` and `deliverTo` make it a hand-over (D14): the result comes back as a card in `deliverTo`'s thread.
 *  `purpose="review"` queues an isolated read-only review run instead of a thread task. `onQueued` receives the agent the task went to. */
export function QueueTaskDialog({ agentName, targetAgents, quote, deliverTo, purpose = "handoff", onClose, onQueued }: { agentName: string; targetAgents?: HandTarget[]; quote?: string; deliverTo?: string; purpose?: "handoff" | "review"; onClose: () => void; onQueued: (target: string) => void }) {
  const { t, locale } = useI18n();
  const review = purpose === "review";
  const sentQuote = useMemo(() => (quote ? clipQuote(quote) : null), [quote]);
  const [prompt, setPrompt] = useState(() => {
    if (!review) return deliverTo ? t("agents.handTo.prompt") : "";
    const excerpt = quote ? reviewExcerpt(quote) : "";
    return [excerpt ? t("agents.askReview.titleLine", { excerpt }) : "", t("agents.askReview.prompt")].filter(Boolean).join("\n\n");
  });
  const [target, setTarget] = useState(agentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lengthId = useId();
  const selfHintId = useId();
  const overCap = prompt.length > PROMPT_MAX;
  const showLength = prompt.length > PROMPT_MAX / 2;
  const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
  const errorKey = error ? queueErrorKey(error) : null;

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(target)}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deliverTo ? { prompt, requestedBy: "user", deliverTo, ...(sentQuote ? { quote: sentQuote.text } : {}), ...(review ? { target: "isolated", kind: "review", tools: REVIEW_TOOLS, purpose } : {}) } : { prompt }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(data.error ?? `HTTP ${response.status}`); return; }
      onQueued(target);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const title = t(review ? "agents.askReview.dialogTitle" : deliverTo ? "agents.handTo.dialogTitle" : "agents.tasks.queueTitle", { name: target });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        {targetAgents && (
          <label style={labelStyle}>
            {t("agents.handTo.target")}
            <select value={target} onChange={(event) => setTarget(event.target.value)} aria-describedby={deliverTo ? selfHintId : undefined} style={fieldStyle}>
              {targetAgents.map((agent) => <option key={agent.name} value={agent.name}>{agent.paused ? `${agent.name} ${t("agents.handTo.paused")}` : !review && agent.running ? `${agent.name} ${t("agents.handTo.busy")}` : agent.name}</option>)}
            </select>
          </label>
        )}
        {targetAgents && deliverTo && <span id={selfHintId} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -6 }}>{t("agents.handTo.selfHint", { name: deliverTo })}</span>}
        {sentQuote && (
          <details style={{ fontSize: 12, color: "var(--text-muted)" }}>
            <summary style={{ cursor: "pointer" }}>{t(review ? "agents.askReview.quote" : "agents.handTo.quote")}</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflow: "auto", margin: "4px 0 0" }}>{sentQuote.text}</pre>
          </details>
        )}
        {sentQuote?.clipped && quote && <span role="note" style={{ fontSize: 12, color: "var(--text)" }}>{t("agents.handTo.quoteClipped", { count: formatCount(quote.length), kept: formatCount(sentQuote.kept) })}</span>}
        <label style={labelStyle}>
          {t("agents.tasks.prompt")}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t(review ? "agents.askReview.placeholder" : "agents.tasks.promptPlaceholder")} rows={6} required aria-describedby={showLength ? lengthId : undefined} aria-invalid={overCap || undefined} style={{ ...fieldStyle, resize: "vertical" }} />
          {error && <span role="alert" style={{ color: ERROR_COLOR }}>{errorKey ? t(errorKey, { max: formatCount(errorKey === "agents.tasks.promptTooLong" ? PROMPT_MAX : QUOTE_MAX) }) : t("agents.error", { error })}</span>}
        </label>
        {showLength && <span id={lengthId} style={{ justifySelf: "end", marginTop: -6, fontSize: 12, fontVariantNumeric: "tabular-nums", color: overCap ? "var(--text)" : "var(--text-muted)", fontWeight: overCap ? 600 : undefined }}>{t("agents.tasks.promptLength", { count: formatCount(prompt.length), max: formatCount(PROMPT_MAX) })}</span>}
        {overCap && <span role="alert" style={{ fontSize: 12, color: "var(--text)" }}>{t("agents.tasks.promptTooLong", { max: formatCount(PROMPT_MAX) })}</span>}
        {deliverTo && !review && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agents.handTo.mentionHint", { name: target })}</span>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !prompt.trim() || overCap} style={{ ...buttonStyle, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-contrast)", cursor: "pointer" }}>{t(review ? "agents.askReview.submit" : "agents.tasks.queue")}</button>
        </div>
      </form>
    </div>
  );
}
