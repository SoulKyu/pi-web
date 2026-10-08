"use client";

import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import type { PayloadFormat } from "@/lib/agent-ops/payload-formats";
import { TRIGGER_TOOL_NAMES } from "@/lib/agent-ops/trigger-tools";
import type { ModelOption } from "./NewAgentDialog";
import { backdropStyle, buttonStyle, fieldStyle, formStyle } from "./dialog-styles";
import { requestTrigger, type TriggerResponse } from "./trigger-view";

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" };
const MS_PER_MINUTE = 60_000;
const isHttpsUrl = (value: string): boolean => { try { return new URL(value).protocol === "https:"; } catch { return false; } };

/** Creates a trigger of `agentName`, or edits `trigger`. The run happens in the agent home. */
export function TriggerDialog({ trigger, prefill, agentName, onClose, onSaved }: {
  trigger?: PublicTrigger;
  /** Initial values of a new trigger; ignored when editing. */
  prefill?: { name?: string; promptTemplate?: string; everyMinutes?: number; runTarget?: "thread" | "isolated" };
  agentName: string;
  onClose: () => void;
  onSaved: (response: Partial<TriggerResponse>) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(trigger?.name ?? prefill?.name ?? "");
  const [promptTemplate, setPromptTemplate] = useState(trigger?.promptTemplate ?? prefill?.promptTemplate ?? "");
  const [everyMinutes, setEveryMinutes] = useState((trigger?.everyMinutes ?? prefill?.everyMinutes)?.toString() ?? "");
  const [at, setAt] = useState(trigger?.at ?? "");
  const [feedUrl, setFeedUrl] = useState(trigger?.source?.url ?? "");
  const [critical, setCritical] = useState(trigger?.critical ?? false);
  const [webhook, setWebhook] = useState(false);
  const [payloadFormat, setPayloadFormat] = useState<PayloadFormat>(trigger?.payloadFormat ?? "raw");
  const [dedupMinutes, setDedupMinutes] = useState(String((trigger?.dedupWindowMs ?? 15 * MS_PER_MINUTE) / MS_PER_MINUTE));
  const [maxActiveTasks, setMaxActiveTasks] = useState(String(trigger?.maxActiveTasks ?? 1));
  const [maxRunsPerDay, setMaxRunsPerDay] = useState(trigger?.maxRunsPerDay ? String(trigger.maxRunsPerDay) : "");
  const [runTarget, setRunTarget] = useState<"thread" | "isolated">(trigger?.runTarget ?? prefill?.runTarget ?? "thread");
  const [model, setModel] = useState(trigger?.model ?? "");
  const [tools, setTools] = useState<string[]>(trigger?.tools ?? [...TRIGGER_TOOL_NAMES]);
  const [maxRunMinutes, setMaxRunMinutes] = useState(trigger?.maxRunMs ? String(trigger.maxRunMs / MS_PER_MINUTE) : "");
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The panel re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const home = await (await fetch(`/api/agents/${encodeURIComponent(agentName)}`, { signal: controller.signal })).json() as { agent?: { home?: string }; home?: string };
        const cwd = home.agent?.home ?? home.home;
        if (!cwd) return;
        const response = await fetch(`/api/models?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { modelList?: ModelOption[] };
        if (response.ok && data.modelList) setModelList(data.modelList);
      } catch { /* the agent's default stays the only option */ }
    })();
    return () => controller.abort();
  }, [agentName]);

  const isFeed = feedUrl.trim() !== "";
  const feedUrlValid = !isFeed || isHttpsUrl(feedUrl.trim());
  const isWebhook = trigger ? trigger.hasWebhookSecret : webhook && !isFeed;
  const isScheduled = (everyMinutes.trim() !== "" || at.trim() !== "") && !isWebhook;
  const isolated = isWebhook || (isScheduled && runTarget === "isolated");
  const modelInList = !model || modelList.some((entry) => `${entry.provider}/${entry.id}` === model);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const fields = {
      name: name.trim(), profile: agentName, promptTemplate,
      dedupWindowMs: Number(dedupMinutes) * MS_PER_MINUTE, maxActiveTasks: Number(maxActiveTasks),
    };
    const every = everyMinutes.trim() ? Number(everyMinutes) : undefined;
    // Absent on create, null on edit: a PATCH clears an optional field only with an explicit null.
    const unset = trigger ? null : undefined;
    const run = {
      at: at.trim() || unset,
      critical: critical ? true : unset,
      maxRunsPerDay: maxRunsPerDay.trim() ? Number(maxRunsPerDay) : unset,
      source: isFeed ? { kind: "feed" as const, url: feedUrl.trim() } : unset,
      payloadFormat: isWebhook && payloadFormat !== "raw" ? payloadFormat : unset,
      runTarget: isScheduled && runTarget === "isolated" ? "isolated" : unset,
      model: isolated && model ? model : unset,
      tools: isolated && tools.length && tools.length < TRIGGER_TOOL_NAMES.length ? tools : unset,
      maxRunMs: isolated && maxRunMinutes.trim() ? Math.round(Number(maxRunMinutes) * MS_PER_MINUTE) : unset,
    };
    const result = await requestTrigger(trigger ? `/api/agent-ops/triggers/${trigger.id}` : "/api/agent-ops/triggers", {
      method: trigger ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trigger ? { ...fields, ...run, everyMinutes: every ?? null } : { ...fields, ...run, everyMinutes: every, webhook: webhook && !isFeed }),
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
        <label style={labelStyle}>
          {t("agentOps.trigger.dailyAt")}
          <input type="time" value={at} onChange={(event) => setAt(event.target.value)} style={fieldStyle} />
        </label>
        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} />
          {t("agentOps.trigger.critical")}
        </label>
        {isScheduled && (
          <fieldset style={{ ...labelStyle, border: 0, padding: 0, margin: 0 }}>
            <legend style={{ padding: 0 }}>{t("agentOps.trigger.runIn")}</legend>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name="runTarget" checked={runTarget === "thread"} onChange={() => setRunTarget("thread")} />
              {t("agentOps.trigger.runInThread")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name="runTarget" checked={runTarget === "isolated"} onChange={() => setRunTarget("isolated")} />
              {t("agentOps.trigger.runInIsolated")}
            </label>
          </fieldset>
        )}
        <label style={labelStyle}>
          {t("agentOps.trigger.feedUrl")}
          <input type="url" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} disabled={Boolean(trigger?.hasWebhookSecret)} placeholder="https://example.com/feed.xml" style={fieldStyle} />
          {!feedUrlValid && <span role="alert">{t("agentOps.trigger.feedUrlInvalid")}</span>}
        </label>
        {!trigger && (
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={webhook && !isFeed} disabled={isFeed} onChange={(event) => setWebhook(event.target.checked)} />
            {t("agentOps.trigger.webhookField")}
            {isFeed && <span>{t("agentOps.trigger.feedNoWebhook")}</span>}
          </label>
        )}
        {isWebhook && (
          <label style={labelStyle}>
            {t("agentOps.trigger.payloadFormat")}
            <select value={payloadFormat} onChange={(event) => setPayloadFormat(event.target.value as PayloadFormat)} style={fieldStyle}>
              <option value="raw">{t("agentOps.trigger.payloadFormat.raw")}</option>
              <option value="alertmanager">{t("agentOps.trigger.payloadFormat.alertmanager")}</option>
              <option value="grafana">{t("agentOps.trigger.payloadFormat.grafana")}</option>
            </select>
          </label>
        )}
        {isolated && (
          <>
            <label style={labelStyle}>
              {t("agentOps.trigger.model")}
              <select value={model} onChange={(event) => setModel(event.target.value)} style={fieldStyle}>
                <option value="">{t("agents.model.default")}</option>
                {!modelInList && <option value={model}>{model}</option>}
                {modelList.map((entry) => <option key={`${entry.provider}/${entry.id}`} value={`${entry.provider}/${entry.id}`}>{entry.name || entry.id}</option>)}
              </select>
            </label>
            <fieldset style={{ ...labelStyle, border: 0, padding: 0, margin: 0 }}>
              <legend style={{ padding: 0 }}>{t("agentOps.trigger.tools")}</legend>
              {TRIGGER_TOOL_NAMES.map((tool) => (
                <label key={tool} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={tools.includes(tool)} onChange={(event) => setTools(event.target.checked ? [...tools, tool] : tools.filter((name) => name !== tool))} />
                  {tool}
                </label>
              ))}
            </fieldset>
            <label style={labelStyle}>
              {t("agentOps.trigger.maxDuration")}
              <input type="number" min={1} max={60} step="any" value={maxRunMinutes} onChange={(event) => setMaxRunMinutes(event.target.value)} style={fieldStyle} />
            </label>
          </>
        )}
        <label style={labelStyle}>
          {t("agentOps.trigger.dedupMinutes")}
          <input type="number" min={1} step="any" value={dedupMinutes} onChange={(event) => setDedupMinutes(event.target.value)} required style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          {t("agentOps.trigger.maxActive")}
          <input type="number" min={1} step={1} value={maxActiveTasks} onChange={(event) => setMaxActiveTasks(event.target.value)} required style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          {t("agentOps.trigger.maxRunsPerDay")}
          <input type="number" min={1} step={1} value={maxRunsPerDay} onChange={(event) => setMaxRunsPerDay(event.target.value)} style={fieldStyle} />
        </label>
        {error && <div role="alert" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("agentOps.actionFailed", { error })}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !feedUrlValid || !name.trim() || !promptTemplate.trim() || (isolated && tools.length === 0)} style={{ ...buttonStyle, border: 0, background: "var(--accent)", color: "var(--accent-contrast)", fontWeight: 600 }}>
            {busy ? t("agentOps.trigger.saving") : trigger ? t("agentOps.trigger.save") : t("agentOps.trigger.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
