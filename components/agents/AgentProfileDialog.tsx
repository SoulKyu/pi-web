"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { AgentDetail } from "@/lib/agents/agent-view";
import type { ToolsPreset } from "@/lib/agents/registry";
import { backdropStyle, buttonStyle, fieldStyle, formStyle, labelStyle } from "./dialog-styles";
import { COLORS, EMOJIS, THINKING_LEVELS, TOOLS_PRESETS, type ModelOption } from "./NewAgentDialog";

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
  const [toolsPreset, setToolsPreset] = useState<ToolsPreset>(agent.toolsPreset);
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [fetchedMcp, setFetchedMcp] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<string[]>(agent.mcpServers);
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

  const toggleMcp = (server: string) => setMcpServers((current) => (current.includes(server) ? current.filter((name) => name !== server) : [...current, server]));
  const mcpNames = [...new Set([...fetchedMcp, ...mcpServers])].sort();
  const title = t("agents.profile.title", { name: agent.name });
  const swatch = (selected: boolean) => ({ minWidth: 28, height: 28, borderRadius: 6, cursor: "pointer", border: selected ? "2px solid var(--accent)" : "1px solid var(--border)" });
  const modelInList = !model || modelList.some((entry) => `${entry.provider}/${entry.id}` === model);
  if (typeof document === "undefined") return null;
  return createPortal(
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void remove()} style={{ ...buttonStyle, border: "1px solid #e5484d", background: "none", color: "#e5484d" }}>{t("agents.profile.delete")}</button>
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
    </div>,
    document.body,
  );
}
