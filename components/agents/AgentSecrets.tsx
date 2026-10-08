"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { buttonStyle, fieldStyle, labelStyle } from "./dialog-styles";


/** Names of the agent's secrets with add and delete. A value is write-only: no route returns it. */
export function AgentSecrets({ agentName }: { agentName: string }) {
  const { t } = useI18n();
  const url = `/api/agents/${encodeURIComponent(agentName)}/secrets`;
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) setNames(((await response.json()) as { names: string[] }).names);
    } catch { /* the list stays as it was */ }
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  const send = async (method: "PUT" | "DELETE", body: { name: string; value?: string }) => {
    setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? t("agents.secrets.error"));
        return false;
      }
      await load();
      return true;
    } catch {
      setError(t("agents.secrets.error"));
      return false;
    }
  };

  return (
    <div style={labelStyle}>
      {t("agents.secrets.title")}
      <span>{t("agents.secrets.hint")}</span>
      {names.length === 0 && <span>{t("agents.secrets.none")}</span>}
      {names.map((secret) => (
        <div key={secret} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code style={{ flex: 1 }}>{secret}</code>
          <button type="button" style={{ ...buttonStyle, padding: "2px 10px", border: "1px solid var(--border)", background: "none", color: "var(--text)" }}
            onClick={() => { if (window.confirm(t("agents.secrets.deleteConfirm", { name: secret }))) void send("DELETE", { name: secret }); }}>{t("agents.secrets.delete")}</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <input style={fieldStyle} placeholder={t("agents.secrets.name")} value={name} autoComplete="off" onChange={(event) => setName(event.target.value.toUpperCase())} />
        <input style={fieldStyle} type="password" placeholder={t("agents.secrets.value")} value={value} autoComplete="new-password" onChange={(event) => setValue(event.target.value)} />
        <button type="button" disabled={!name || !value} style={{ ...buttonStyle, border: "1px solid var(--border)", background: "none", color: "var(--text)" }}
          onClick={async () => { if (await send("PUT", { name, value })) { setName(""); setValue(""); } }}>{t("agents.secrets.add")}</button>
      </div>
      {error && <span role="alert" style={{ color: "var(--color-tron-red)" }}>{error}</span>}
    </div>
  );
}
