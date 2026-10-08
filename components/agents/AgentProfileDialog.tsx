"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { AgentDetail } from "@/lib/agents/agent-view";
import type { ToolsPreset } from "@/lib/agents/registry";
import { COMMAND_DENY_PRESETS } from "@/lib/agents/command-policy";
import { HOST_RE } from "@/lib/agents/egress-policy";
import { curationPrompt } from "@/lib/agents/curation-prompt";
import { AgentPermissions } from "./AgentPermissions";
import { AgentSecrets } from "./AgentSecrets";
import { TriggerDialog } from "./TriggerDialog";
import { TriggerSecretDialog } from "./TriggerSecretDialog";
import { backdropStyle, buttonStyle, fieldStyle, formStyle, labelStyle } from "./dialog-styles";
import { COLORS, EMOJIS, THINKING_LEVELS, TOOLS_PRESETS, type ModelOption } from "./NewAgentDialog";
import { toast } from "sonner";

type RotatedSecret = { triggerId: string; name: string; webhookSecret: string };

export function AgentProfileDialog({ agent, onClose, onSaved, onDeleted, onThreadReset }: { agent: AgentDetail; onClose: () => void; onSaved: (agent: AgentDetail) => void; onDeleted: () => void; onThreadReset: () => void }) {
  const { t } = useI18n();
  const [emoji, setEmoji] = useState(agent.avatar.emoji);
  const [color, setColor] = useState(agent.avatar.color);
  const [role, setRole] = useState(agent.role);
  const [model, setModel] = useState(agent.model ?? "");
  const [thinking, setThinking] = useState(agent.thinking ?? "");
  const [budgetTokens, setBudgetTokens] = useState(agent.budgetTokensPerDay === undefined ? "" : String(agent.budgetTokensPerDay));
  const [budgetUsd, setBudgetUsd] = useState(agent.budgetUsdPerDay === undefined ? "" : String(agent.budgetUsdPerDay));
  const [memoryCapture, setMemoryCapture] = useState<"auto" | "off">(agent.memoryCapture ?? "auto");
  const [memorySave, setMemorySave] = useState<"direct" | "staged">(agent.memorySave ?? "direct");
  const [memoryHint, setMemoryHint] = useState(agent.memoryHint ?? "");
  const [memoryRecallLimit, setMemoryRecallLimit] = useState(agent.memoryRecallLimit === undefined ? "" : String(agent.memoryRecallLimit));
  const [memoryRecallThreshold, setMemoryRecallThreshold] = useState(agent.memoryRecallThreshold === undefined ? "" : String(agent.memoryRecallThreshold));
  const [commandDeny, setCommandDeny] = useState((agent.commandDeny ?? []).join("\n"));
  const [webAllowHosts, setWebAllowHosts] = useState((agent.webAllowHosts ?? []).join("\n"));
  const [sandbox, setSandbox] = useState(agent.sandbox === "bubblewrap");
  const [sandboxNetwork, setSandboxNetwork] = useState(agent.sandboxNetwork === true);
  const [rotated, setRotated] = useState<RotatedSecret[]>([]);
  const [toolsPreset, setToolsPreset] = useState<ToolsPreset>(agent.toolsPreset);
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [fetchedMcp, setFetchedMcp] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<string[]>(agent.mcpServers);
  const [curation, setCuration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => openStackedDialog(document, dialogRef.current, () => onCloseRef.current()), []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const home = await (await fetch("/api/home", { signal: controller.signal })).json() as { home?: string };
        if (!home.home) return;
        const response = await fetch(`/api/models?cwd=${encodeURIComponent(home.home)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { modelList?: ModelOption[] };
        if (response.ok && data.modelList) setModelList(data.modelList);
      } catch { /* the default model stays the only option */ }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/agents/mcp-servers", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { servers?: string[] };
        if (response.ok && Array.isArray(data.servers)) setFetchedMcp(data.servers);
      } catch { /* no list: only the agent's own servers show */ }
    })();
    return () => controller.abort();
  }, []);

  const appendDenyPreset = (preset: keyof typeof COMMAND_DENY_PRESETS) => {
    const current = commandDeny.split("\n").map((line) => line.trim()).filter(Boolean);
    setCommandDeny([...current, ...COMMAND_DENY_PRESETS[preset].filter((line) => !current.includes(line))].join("\n"));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (role !== agent.role) patch.role = role;
      if (toolsPreset !== agent.toolsPreset) patch.toolsPreset = toolsPreset;
      if (emoji !== agent.avatar.emoji || color !== agent.avatar.color) patch.avatar = { emoji, color };
      if ((model || undefined) !== agent.model) patch.model = model || null;
      if ((thinking || undefined) !== agent.thinking) patch.thinking = thinking || null;
      const tokens = budgetTokens === "" ? undefined : Number(budgetTokens);
      const usd = budgetUsd === "" ? undefined : Number(budgetUsd);
      if (tokens !== agent.budgetTokensPerDay) patch.budgetTokensPerDay = tokens ?? null;
      if (usd !== agent.budgetUsdPerDay) patch.budgetUsdPerDay = usd ?? null;
      if (memoryCapture !== (agent.memoryCapture ?? "auto")) patch.memoryCapture = memoryCapture === "auto" ? null : memoryCapture;
      if (memorySave !== (agent.memorySave ?? "direct")) patch.memorySave = memorySave === "direct" ? null : memorySave;
      if ((memoryHint.trim() || undefined) !== agent.memoryHint) patch.memoryHint = memoryHint.trim() || null;
      const denyLines = commandDeny.split("\n").map((line) => line.trim()).filter(Boolean);
      const invalidDeny = denyLines.find((line) => { try { new RegExp(line); return false; } catch { return true; } });
      if (invalidDeny !== undefined) { setError(t("agents.profile.commandDenyInvalid", { pattern: invalidDeny })); return; }
      if (denyLines.join("\n") !== (agent.commandDeny ?? []).join("\n")) patch.commandDeny = denyLines.length ? denyLines : null;
      const hostLines = webAllowHosts.split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean);
      const invalidHost = hostLines.find((line) => !HOST_RE.test(line));
      if (invalidHost !== undefined) { setError(t("agents.profile.webAllowHostsInvalid", { host: invalidHost })); return; }
      if (hostLines.join("\n") !== (agent.webAllowHosts ?? []).join("\n")) patch.webAllowHosts = hostLines.length ? hostLines : null;
      if (sandbox !== (agent.sandbox === "bubblewrap")) patch.sandbox = sandbox ? "bubblewrap" : null;
      if (sandboxNetwork !== (agent.sandboxNetwork === true)) patch.sandboxNetwork = sandboxNetwork ? true : null;
      const recallLimit = memoryRecallLimit === "" ? undefined : Number(memoryRecallLimit);
      const recallThreshold = memoryRecallThreshold === "" ? undefined : Number(memoryRecallThreshold);
      if (recallLimit !== agent.memoryRecallLimit) patch.memoryRecallLimit = recallLimit ?? null;
      if (recallThreshold !== agent.memoryRecallThreshold) patch.memoryRecallThreshold = recallThreshold ?? null;
      if (mcpServers.length !== agent.mcpServers.length || mcpServers.some((name) => !agent.mcpServers.includes(name))) patch.mcpServers = mcpServers;
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.name)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json().catch(() => ({})) as { agent?: AgentDetail; error?: string };
      if (response.status === 409) { setError(t("agents.profile.running")); return; }
      if (!response.ok || !data.agent) { setError(t("agents.error", { error: data.error ?? `HTTP ${response.status}` })); return; }
      onSaved(data.agent);
      onClose();
    } catch (cause) {
      setError(t("agents.error", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("agents.profile.deleteConfirm", { name: agent.name }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.name)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 409) { setError(t("agents.profile.running")); return; }
      if (!response.ok) { setError(t("agents.error", { error: data.error ?? `HTTP ${response.status}` })); return; }
      onDeleted();
      onClose();
    } catch (cause) {
      setError(t("agents.error", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusy(false);
    }
  };

  const quarantine = async () => {
    if (!window.confirm(t("agents.profile.quarantineConfirm", { name: agent.name }))) return;
    const listed = await fetch(`/api/agent-ops/triggers?agent=${encodeURIComponent(agent.name)}`, { cache: "no-store" }).then((r) => r.json(), () => ({})) as { triggers?: { hasWebhookSecret?: boolean }[] };
    const rotating = listed.triggers?.filter((trigger) => trigger.hasWebhookSecret).length ?? 0;
    if (!window.confirm(t("agents.profile.quarantineConfirmSecrets", { count: rotating }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.name)}/quarantine`, { method: "POST" });
      const data = await response.json().catch(() => ({})) as { error?: string; secrets?: RotatedSecret[]; vaultSecrets?: string[]; errors?: string[] };
      if (!response.ok) { setError(t("agents.error", { error: data.error ?? `HTTP ${response.status}` })); return; }
      onSaved(agent); // reloads the agent list: the paused badge
      if (data.errors?.length) toast.warning(t("agents.profile.quarantinePartial", { errors: data.errors.join("; ") }), { duration: Infinity, closeButton: true });
      if (data.vaultSecrets?.length) toast.warning(t("agents.profile.quarantineVault", { names: data.vaultSecrets.join(", ") }), { duration: Infinity, closeButton: true });
      if (data.secrets?.length) setRotated(data.secrets);
      else onClose();
    } catch (cause) {
      setError(t("agents.error", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusy(false);
    }
  };

  const toggleMcp = (server: string) => setMcpServers((current) => (current.includes(server) ? current.filter((name) => name !== server) : [...current, server]));
  const mcpNames = [...new Set([...fetchedMcp, ...mcpServers])].sort();
  const title = t("agents.profile.title", { name: agent.name });
  const swatch = (selected: boolean) => ({ minWidth: 28, height: 28, borderRadius: 0, cursor: "pointer", border: selected ? "2px solid var(--accent)" : "1px solid var(--border)" });
  const modelInList = !model || modelList.some((entry) => `${entry.provider}/${entry.id}` === model);
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        {error && <span role="alert" style={{ fontSize: 12, color: "var(--text-muted)" }}>{error}</span>}
        <div style={labelStyle}>
          {t("agents.new.avatar")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EMOJIS.map((candidate) => (
              <button key={candidate} type="button" aria-pressed={emoji === candidate} onClick={() => setEmoji(candidate)} style={{ ...swatch(emoji === candidate), background: "var(--bg-panel)" }}>{candidate}</button>
            ))}
            <input value={emoji} maxLength={8} onChange={(event) => setEmoji(event.target.value)} aria-label={t("agents.new.avatar")} style={{ ...fieldStyle, width: 64 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COLORS.map((candidate) => (
              <button key={candidate} type="button" aria-pressed={color === candidate} aria-label={candidate} onClick={() => setColor(candidate)} style={{ ...swatch(color === candidate), background: candidate }} />
            ))}
          </div>
        </div>
        <label style={labelStyle}>
          {t("agents.new.role")}
          <textarea value={role} onChange={(event) => setRole(event.target.value)} required rows={5} placeholder={t("agents.new.rolePlaceholder")} style={{ ...fieldStyle, fontFamily: "inherit", resize: "vertical" }} />
        </label>
        <details style={{ fontSize: 12, color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer" }}>?</summary>
          {t("agents.new.roleHelp")}
        </details>
        <label style={labelStyle}>
          {t("agents.new.model")}
          <select value={model} onChange={(event) => setModel(event.target.value)} style={fieldStyle}>
            <option value="">{t("agents.model.default")}</option>
            {!modelInList && <option value={model}>{model}</option>}
            {modelList.map((entry) => <option key={`${entry.provider}/${entry.id}`} value={`${entry.provider}/${entry.id}`}>{entry.name || entry.id}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          {t("agents.new.thinking")}
          <select value={thinking} onChange={(event) => setThinking(event.target.value)} style={fieldStyle}>
            <option value="">{t("agents.model.default")}</option>
            {THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          {t("agents.new.budgetTokens")}
          <input type="number" min={0} step={1} value={budgetTokens} onChange={(event) => setBudgetTokens(event.target.value)} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          {t("agents.new.budgetUsd")}
          <input type="number" min={0} step="any" value={budgetUsd} onChange={(event) => setBudgetUsd(event.target.value)} style={fieldStyle} />
        </label>
        <div style={labelStyle}>
          {t("agents.new.memory")}
          <select aria-label={t("agents.new.memoryCapture")} value={memoryCapture} onChange={(event) => setMemoryCapture(event.target.value as "auto" | "off")} style={fieldStyle}>
            <option value="auto">{t("agents.new.memoryCapture")}: {t("agents.new.memoryCaptureAuto")}</option>
            <option value="off">{t("agents.new.memoryCapture")}: {t("agents.new.memoryCaptureOff")}</option>
          </select>
          <select aria-label={t("agents.new.memorySave")} value={memorySave} onChange={(event) => setMemorySave(event.target.value as "direct" | "staged")} style={fieldStyle}>
            <option value="direct">{t("agents.new.memorySave")}: {t("agents.new.memorySaveDirect")}</option>
            <option value="staged">{t("agents.new.memorySave")}: {t("agents.new.memorySaveStaged")}</option>
          </select>
          <textarea aria-label={t("agents.new.memoryHint")} placeholder={t("agents.new.memoryHint")} maxLength={500} rows={2} value={memoryHint} onChange={(event) => setMemoryHint(event.target.value)} style={fieldStyle} />
          <input type="number" aria-label={t("agents.new.memoryRecallLimit")} placeholder={t("agents.new.memoryRecallLimit")} min={0} max={20} step={1} value={memoryRecallLimit} onChange={(event) => setMemoryRecallLimit(event.target.value)} style={fieldStyle} />
          <input type="number" aria-label={t("agents.new.memoryRecallThreshold")} placeholder={t("agents.new.memoryRecallThreshold")} min={0} max={1} step={0.05} value={memoryRecallThreshold} onChange={(event) => setMemoryRecallThreshold(event.target.value)} style={fieldStyle} />
        </div>
        <div style={labelStyle}>
          {t("agents.profile.webAllowHosts")}
          <textarea aria-label={t("agents.profile.webAllowHosts")} placeholder="example.com&#10;*.example.com" rows={3} value={webAllowHosts} onChange={(event) => setWebAllowHosts(event.target.value)} style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
        </div>
        <div style={labelStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" role="switch" disabled={!agent.sandboxAvailable && !sandbox} checked={sandbox} onChange={(event) => setSandbox(event.target.checked)} />
            {t("agents.profile.sandbox")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" disabled={!sandbox} checked={sandboxNetwork} onChange={(event) => setSandboxNetwork(event.target.checked)} />
            {t("agents.profile.sandboxNetwork")}
          </label>
          <span style={{ color: "var(--text-muted)" }}>{t(agent.sandboxAvailable ? "agents.profile.sandboxAvailable" : "agents.profile.sandboxUnavailable")}</span>
        </div>
        <div style={labelStyle}>
          {t("agents.profile.commandDeny")}
          <textarea aria-label={t("agents.profile.commandDeny")} placeholder={t("agents.profile.commandDeny")} rows={4} value={commandDeny} onChange={(event) => setCommandDeny(event.target.value)} style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => appendDenyPreset("cautious-sre")} style={buttonStyle}>{t("agents.profile.denyPresetCautious")}</button>
            <button type="button" onClick={() => appendDenyPreset("reports-only")} style={buttonStyle}>{t("agents.profile.denyPresetReports")}</button>
          </div>
        </div>
        <div style={labelStyle}>
          {t("agents.new.tools")}
          <div role="group" aria-label={t("agents.new.tools")} style={{ display: "flex", gap: 6 }}>
            {TOOLS_PRESETS.map((preset) => (
              <button key={preset} type="button" aria-pressed={toolsPreset === preset} onClick={() => setToolsPreset(preset)} style={{ ...buttonStyle, flex: 1, border: "1px solid var(--border)", background: toolsPreset === preset ? "var(--bg-selected)" : "none", color: "var(--text)" }}>{t(`agents.tools.${preset}`)}</button>
            ))}
          </div>
        </div>
        <div style={labelStyle}>
          {t("agents.new.mcp")}
          <span style={{ color: "var(--text-muted)" }}>{t("agents.new.mcpHint")}</span>
          {mcpNames.length === 0 && <span style={{ color: "var(--text-muted)" }}>{t("agents.new.mcpNone")}</span>}
          {mcpNames.map((server) => (
            <label key={server} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={mcpServers.includes(server)} onChange={() => toggleMcp(server)} />
              {server}
              {!fetchedMcp.includes(server) && <span style={{ color: "var(--text-muted)" }}>{t("agents.new.mcpMissing")}</span>}
            </label>
          ))}
        </div>
        <AgentSecrets agentName={agent.name} />
        <AgentPermissions agentName={agent.name} />
        {agent.memorySnapshotPath && (
          <button type="button" disabled={busy} onClick={() => setCuration(true)} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text)" }}>{t("agents.profile.scheduleCuration")}</button>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void remove()} style={{ ...buttonStyle, border: "1px solid var(--color-tron-red)", background: "none", color: "var(--color-tron-red)" }}>{t("agents.profile.delete")}</button>
            <button type="button" disabled={busy} onClick={() => void quarantine()} style={{ ...buttonStyle, border: 0, background: "var(--color-tron-red)", color: "var(--accent-contrast)", fontWeight: 600 }}>{t("agents.profile.quarantine")}</button>
            <button type="button" disabled={busy} onClick={() => { onThreadReset(); onClose(); }} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("agents.profile.reset")}</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
            <button type="submit" disabled={busy || !role.trim() || !emoji} style={{ ...buttonStyle, border: 0, background: "var(--accent)", color: "var(--accent-contrast)", fontWeight: 600 }}>
              {busy ? t("agents.profile.saving") : t("agents.profile.save")}
            </button>
          </div>
        </div>
      </form>
    </div>
    {rotated[0] && (
      <TriggerSecretDialog
        key={rotated[0].triggerId}
        triggerId={rotated[0].triggerId}
        triggerName={rotated[0].name}
        secret={rotated[0].webhookSecret}
        onClose={() => { if (rotated.length > 1) setRotated(rotated.slice(1)); else { setRotated([]); onClose(); } }}
      />
    )}
    {curation && agent.memorySnapshotPath && (
      <TriggerDialog
        agentName={agent.name}
        prefill={{ name: "Memory curation", everyMinutes: 7 * 24 * 60, runTarget: "thread", promptTemplate: curationPrompt(agent.name, agent.memorySnapshotPath) }}
        onClose={() => setCuration(false)}
        onSaved={() => { setCuration(false); onClose(); }}
      />
    )}
    </>,
    document.body,
  );
}
