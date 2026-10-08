"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentPermissions as Permissions } from "@/lib/agents/permissions";
import { labelStyle } from "./dialog-styles";

const LEGS = ["privateData", "untrustedContent", "exfiltration"] as const;
const muted = { color: "var(--text-muted)" };

/** Read-only sheet of what an agent can do, with the lethal-trifecta check. Fetched when the dialog opens. */
export function AgentPermissions({ agentName }: { agentName: string }) {
  const { t } = useI18n();
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agentName)}/permissions`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { permissions?: Permissions };
        if (!response.ok || !data.permissions) { setFailed(true); return; }
        setPermissions(data.permissions);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [agentName]);

  if (failed) return <div style={labelStyle}>{t("agents.permissions.title")}<span style={muted}>{t("agents.permissions.error")}</span></div>;
  if (!permissions) return <div style={labelStyle}>{t("agents.permissions.title")}<span style={muted}>{t("agents.permissions.loading")}</span></div>;

  const list = (items: readonly string[]) => (items.length ? items.join(", ") : t("agents.permissions.none"));
  const count = LEGS.filter((leg) => permissions.trifecta[leg]).length;
  const rows: Array<[string, string]> = [
    [t("agents.permissions.tools"), `${list(permissions.tools)} (${permissions.preset})`],
    [t("agents.permissions.mcp"), `${list(permissions.mcpAllowed)}; ${t("agents.permissions.mcpBlocked", { count: permissions.mcpBlockedCount })}`],
    [t("agents.permissions.extensionTools"), permissions.extensionTools === "unknown-until-start" ? t("agents.permissions.unknownUntilStart") : list(permissions.extensionTools)],
    [t("agents.permissions.memory"), `${permissions.memory.capture} / ${permissions.memory.save}`],
    [t("agents.permissions.triggers"), list(permissions.triggers.map((trigger) => `${trigger.name} (${trigger.target})`))],
    [t("agents.permissions.commandDeny"), String(permissions.commandDeny.length)],
    [t("agents.permissions.webHosts"), permissions.webAllowHosts === "any" ? t("agents.permissions.anyHost") : list(permissions.webAllowHosts)],
    [t("agents.permissions.env"), permissions.env],
    [t("agents.permissions.sandbox"), permissions.sandbox],
    [t("agents.permissions.secrets"), list(permissions.secrets)],
  ];
  return (
    <div style={labelStyle}>
      {t("agents.permissions.title")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {LEGS.map((leg) => (
          <span key={leg} title={permissions.trifectaReasons[leg].join(", ")} style={{ padding: "2px 8px", borderRadius: 0, fontSize: 11, border: `1px solid ${permissions.trifecta[leg] ? "var(--color-tron-red)" : "var(--border)"}`, color: permissions.trifecta[leg] ? "var(--color-tron-red)" : "var(--text-muted)" }}>{t(`agents.permissions.${leg}`)}</span>
        ))}
        <span style={muted}>{count}/3</span>
      </div>
      {count === 3 && <span role="alert" style={{ color: "var(--color-tron-red)" }}>{t("agents.permissions.trifectaWarning")}</span>}
      {LEGS.filter((leg) => permissions.trifectaReasons[leg].length > 0).map((leg) => (
        <span key={leg} style={muted}>{t(`agents.permissions.${leg}`)}: {permissions.trifectaReasons[leg].join(", ")}</span>
      ))}
      {rows.map(([label, value]) => <span key={label}><span style={muted}>{label}: </span>{value}</span>)}
      {permissions.notCovered.map((note) => <span key={note} style={muted}>{note}</span>)}
    </div>
  );
}
