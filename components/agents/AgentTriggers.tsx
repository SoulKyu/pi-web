"use client";

import { type CSSProperties, useState } from "react";
import type { TriggerLogEntry } from "@/lib/agent-ops/trigger-log";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { AgentTaskListItem } from "@/lib/agent-ops/task-list";
import type { PublicTrigger } from "@/lib/agent-ops/trigger-api";
import { AgentTasks } from "./AgentTasks";
import { TriggerDialog } from "./TriggerDialog";
import type { PayloadFormat } from "@/lib/agent-ops/payload-formats";
import { TriggerSecretDialog } from "./TriggerSecretDialog";
import { requestTrigger, tasksOfTrigger, triggerActivity, type TriggerResponse } from "./trigger-view";

const smallButton: CSSProperties = { padding: "2px 10px", borderRadius: 6, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer" };

const SOURCE_ICON: Record<TriggerLogEntry["source"], string> = { schedule: "⏱", webhook: "🪝", manual: "▶" };

interface Journal { entries: TriggerLogEntry[]; rejectedUnauthenticated: number }

function TriggerJournal({ triggerId }: { triggerId: string }) {
  const { locale, t } = useI18n();
  const [journal, setJournal] = useState<Journal | null>(null);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    try {
      const response = await fetch(`/api/agent-ops/triggers/${triggerId}/log?limit=50`);
      if (!response.ok) throw new Error(String(response.status));
      setJournal(await response.json() as Journal);
      setFailed(false);
    } catch { setFailed(true); }
  };
  return (
    <details onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
      <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>{t("agentOps.trigger.journal")}</summary>
      <div style={{ marginTop: 6, display: "grid", gap: 2, fontSize: 11, color: "var(--text-muted)" }}>
        {failed && <div role="alert">{t("agentOps.actionFailed", { error: "log" })}</div>}
        {journal && journal.entries.length === 0 && <div>{t("agentOps.trigger.journalEmpty")}</div>}
        {journal?.entries.map((entry, index) => (
          <div key={`${entry.at}-${index}`} style={{ display: "flex", gap: 6, minWidth: 0 }}>
            <span aria-hidden>{SOURCE_ICON[entry.source]}</span>
            <span aria-label={entry.verdict}>{entry.verdict === "accepted" ? "✓" : "✗"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.reason ?? ""}</span>
            <span style={{ marginLeft: "auto", flexShrink: 0, color: "var(--text-dim)" }}>
              {entry.taskId ? `${entry.taskId.slice(0, 8)} · ` : ""}{formatRelativeTime(entry.at, locale)}
            </span>
          </div>
        ))}
        {journal && journal.rejectedUnauthenticated > 0 && <div style={{ color: "var(--text-dim)" }}>{t("agentOps.trigger.journalRejected", { count: journal.rejectedUnauthenticated })}</div>}
      </div>
    </details>
  );
}

interface DryRunPlan { verdict: "accepted" | "refused"; reason?: string; prompt?: string; tokenFree: boolean; tools: string[]; pinStatus: string; target: "thread" | "isolated" }
const PROMPT_LINES = 40;

function TriggerTestPanel({ plan, template, onClose }: { plan: DryRunPlan; template: string; onClose: () => void }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const lines = (plan.prompt ?? template).split("\n");
  const clipped = !all && lines.length > PROMPT_LINES;
  return (
    <div style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
      <div>{t("agentOps.trigger.testVerdict", { verdict: plan.verdict })}</div>
      {plan.reason && <div>{t("agentOps.trigger.testReason", { reason: plan.reason })}</div>}
      <div>{t("agentOps.trigger.testTokenFree", { value: plan.tokenFree ? t("agentOps.trigger.yes") : t("agentOps.trigger.no") })}</div>
      <div>{t("agentOps.trigger.testTarget", { target: plan.target })}</div>
      <div>{t("agentOps.trigger.testPin", { status: plan.pinStatus })}</div>
      <div>{t("agentOps.trigger.testTools", { tools: plan.tools.length ? plan.tools.join(", ") : t("agentOps.trigger.testToolsThread") })}</div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-mono)", color: "var(--text)" }}>{(clipped ? lines.slice(0, PROMPT_LINES) : lines).join("\n")}</pre>
      <div style={{ display: "flex", gap: 6 }}>
        {lines.length > PROMPT_LINES && <button type="button" onClick={() => setAll(!all)} style={smallButton}>{all ? t("agentOps.trigger.showLess") : t("agentOps.trigger.showAll")}</button>}
        <button type="button" onClick={onClose} style={smallButton}>{t("agentOps.trigger.testClose")}</button>
      </div>
    </div>
  );
}

interface Reveal { triggerId: string; triggerName: string; secret: string; payloadFormat?: PayloadFormat }

function TriggerRow({ trigger, tasks, onEdit, onReveal, onOpenSession, onChanged }: {
  trigger: PublicTrigger;
  tasks: readonly AgentTaskListItem[];
  onEdit: () => void;
  onReveal: (reveal: Reveal) => void;
  onOpenSession: (sessionId: string) => void;
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [plan, setPlan] = useState<DryRunPlan | null>(null);
  const [fired, setFired] = useState<string | null>(null);
  const url = `/api/agent-ops/triggers/${trigger.id}`;
  const history = tasksOfTrigger(tasks, trigger.id);
  const { active, lastFireAt } = triggerActivity(tasks, trigger.id);
  const schedule = [
    trigger.everyMinutes ? t("agentOps.trigger.every", { minutes: trigger.everyMinutes }) : null,
    trigger.hasWebhookSecret ? t("agentOps.trigger.webhook") : null,
  ].filter(Boolean).join(" · ") || t("agentOps.trigger.noSchedule");

  const run = async (init: RequestInit, path = url, changes = true) => {
    const result = await requestTrigger(path, init);
    setError("error" in result ? result.error : null);
    if ("error" in result) return null;
    if (changes) onChanged();
    return result.data;
  };
  const toggle = () => void run({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !trigger.enabled }) });
  const rotate = async () => {
    if (trigger.hasWebhookSecret && !window.confirm(t("agentOps.trigger.rotateConfirm", { name: trigger.name }))) return;
    const data = await run({ method: "POST" }, `${url}/secret`);
    if (data?.webhookSecret) onReveal({ triggerId: trigger.id, triggerName: trigger.name, secret: data.webhookSecret, payloadFormat: trigger.payloadFormat });
  };
  const repin = () => {
    if (window.confirm(t("agentOps.trigger.repinConfirm", { name: trigger.name, profile: trigger.profile }))) {
      void run({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repin: true }) });
    }
  };
  const test = async () => {
    const data = await run({ method: "POST" }, `${url}/dry-run`, false);
    const dryRun = (data as { plan?: DryRunPlan } | null)?.plan;
    if (dryRun) setPlan(dryRun);
  };
  const runNow = async () => {
    if (!window.confirm(t("agentOps.trigger.runNowConfirm", { name: trigger.name }))) return;
    const response = await fetch(`${url}/fire`, { method: "POST" }).catch(() => null);
    const body = await response?.json().catch(() => ({})) as { taskId?: string; reason?: string; error?: string } | undefined;
    if (response?.ok && body?.taskId) { setError(null); setFired(t("agentOps.trigger.runStarted", { id: body.taskId.slice(0, 8) })); onChanged(); }
    else if (response?.status === 409) { setError(null); setFired(t("agentOps.trigger.runRefused", { reason: body?.reason ?? "" })); }
    else setError(body?.error ?? "fire");
  };
  const remove = () => {
    if (window.confirm(t("agentOps.trigger.deleteConfirm", { name: trigger.name }))) void run({ method: "DELETE" });
  };

  return (
    <li style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-panel)", display: "grid", gap: 6, minWidth: 0, opacity: trigger.enabled ? 1 : 0.7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <input type="checkbox" role="switch" checked={trigger.enabled} onChange={toggle} aria-label={t("agentOps.trigger.toggle", { name: trigger.name })} />
          <strong style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trigger.name}</strong>
        </label>
                <span style={{ marginLeft: "auto", flexShrink: 0, color: "var(--text-muted)" }}>{schedule}</span>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-dim)" }}>
        <span>{lastFireAt ? t("agentOps.trigger.lastFire", { time: formatRelativeTime(lastFireAt, locale) }) : t("agentOps.trigger.neverFired")}</span>
        <span>{t("agentOps.trigger.active", { count: active })}</span>
      </div>
      {trigger.pinStatus !== "ok" && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}>
          <span>{trigger.pinStatus === "drift" ? t("agentOps.trigger.pinDrift", { profile: trigger.profile }) : t("agentOps.trigger.pinMissing", { profile: trigger.profile })}</span>
          {trigger.pinStatus === "drift" && <button type="button" onClick={repin} style={{ ...smallButton, marginLeft: "auto", flexShrink: 0 }}>{t("agentOps.trigger.repin")}</button>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void test()} style={smallButton}>{t("agentOps.trigger.test")}</button>
        <button type="button" onClick={() => void runNow()} style={smallButton}>{t("agentOps.trigger.runNow")}</button>
        <button type="button" onClick={onEdit} style={smallButton}>{t("agentOps.trigger.edit")}</button>
        <button type="button" onClick={() => void rotate()} style={smallButton}>{trigger.hasWebhookSecret ? t("agentOps.trigger.rotate") : t("agentOps.trigger.generate")}</button>
        <button type="button" onClick={remove} style={smallButton}>{t("agentOps.trigger.delete")}</button>
      </div>
      {plan && <TriggerTestPanel plan={plan} template={trigger.promptTemplate} onClose={() => setPlan(null)} />}
      {fired && <div role="status" style={{ fontSize: 11, color: "var(--text-muted)" }}>{fired}</div>}
      {history.length > 0 && (
        <details onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>{t("agentOps.trigger.history", { count: history.length })}</summary>
          {historyOpen && <div style={{ marginTop: 6 }}><AgentTasks nested tasks={history} onOpenSession={onOpenSession} onChanged={onChanged} /></div>}
        </details>
      )}
      <TriggerJournal triggerId={trigger.id} />
      {error && <div role="alert" style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("agentOps.actionFailed", { error })}</div>}
    </li>
  );
}

export function AgentTriggers({ agentName, triggers, tasks, onOpenSession, onChanged }: {
  agentName: string;
  triggers: readonly PublicTrigger[];
  tasks: readonly AgentTaskListItem[];
  onOpenSession: (sessionId: string) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<{ trigger?: PublicTrigger } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const saved = (response: Partial<TriggerResponse>) => {
    onChanged();
    if (response.trigger && response.webhookSecret) setReveal({ triggerId: response.trigger.id, triggerName: response.trigger.name, secret: response.webhookSecret, payloadFormat: response.trigger.payloadFormat });
  };

  return (
    <section aria-label={t("agentOps.triggers")} style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => setDialog({})} style={{ ...smallButton, marginLeft: "auto" }}>{t("agentOps.trigger.new")}</button>
      </div>
      {triggers.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("agentOps.trigger.none")}</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {triggers.map((trigger) => (
          <TriggerRow key={trigger.id} trigger={trigger} tasks={tasks} onEdit={() => setDialog({ trigger })} onReveal={setReveal} onOpenSession={onOpenSession} onChanged={onChanged} />
        ))}
      </ul>
      {dialog && <TriggerDialog trigger={dialog.trigger} agentName={agentName} onClose={() => setDialog(null)} onSaved={saved} />}
      {reveal && <TriggerSecretDialog {...reveal} onClose={() => setReveal(null)} />}
    </section>
  );
}
