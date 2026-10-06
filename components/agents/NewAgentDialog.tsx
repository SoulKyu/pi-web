"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { AgentDetail } from "@/lib/agents/agent-view";
import type { ToolsPreset } from "@/lib/agents/registry";
import { backdropStyle, buttonStyle, fieldStyle, formStyle, labelStyle } from "./dialog-styles";

const EMOJIS = ["🛠", "🤖", "📚", "🔍", "🧭", "🛰", "🧪", "📈"];
const COLORS = ["#e07a5f", "#3d9970", "#8e7cc3", "#6c8cff", "#f5a524", "#e5484d", "#30a46c", "#555555"];
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const TOOLS_PRESETS: ToolsPreset[] = ["read-only", "standard", "full"];

interface ModelOption { id: string; name: string; provider: string }

export function NewAgentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (agent: AgentDetail) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [role, setRole] = useState("");
  const [model, setModel] = useState("");
  const [thinking, setThinking] = useState("");
  const [toolsPreset, setToolsPreset] = useState<ToolsPreset>("standard");
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The shell re-renders on every poll with a fresh onClose: open the dialog once, call the latest one.
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), role, toolsPreset, avatar: { emoji, color }, ...(model ? { model } : {}), ...(thinking ? { thinking } : {}) };
      const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as { agent?: AgentDetail; error?: string };
      if (!response.ok || !data.agent) { setError(data.error ?? `HTTP ${response.status}`); return; }
      onCreated(data.agent);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const title = t("agents.new.title");
  const swatch = (selected: boolean) => ({ minWidth: 28, height: 28, borderRadius: 6, cursor: "pointer", border: selected ? "2px solid var(--accent)" : "1px solid var(--border)" });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={backdropStyle}>
      <form onSubmit={(event) => void submit(event)} style={formStyle}>
        <strong style={{ fontSize: 14, color: "var(--text)" }}>{title}</strong>
        <label style={labelStyle}>
          {t("agents.new.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} required spellCheck={false} style={fieldStyle} />
          {error && <span role="alert" style={{ color: "var(--text-muted)" }}>{t("agents.error", { error })}</span>}
        </label>
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
        <div style={labelStyle}>
          {t("agents.new.tools")}
          <div role="group" aria-label={t("agents.new.tools")} style={{ display: "flex", gap: 6 }}>
            {TOOLS_PRESETS.map((preset) => (
              <button key={preset} type="button" aria-pressed={toolsPreset === preset} onClick={() => setToolsPreset(preset)} style={{ ...buttonStyle, flex: 1, border: "1px solid var(--border)", background: toolsPreset === preset ? "var(--bg-selected)" : "none", color: "var(--text)" }}>{t(`agents.tools.${preset}`)}</button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{t("agents.new.home", { path: `~/.pi/agent/agents-home/${name.trim() || "<name>"}` })}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)" }}>{t("i18n.cancel")}</button>
          <button type="submit" disabled={busy || !name.trim() || !role.trim() || !emoji} style={{ ...buttonStyle, border: 0, background: "var(--accent)", color: "var(--accent-contrast)", fontWeight: 600 }}>
            {busy ? t("agents.new.creating") : t("agents.new.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
