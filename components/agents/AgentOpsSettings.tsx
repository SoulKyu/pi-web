"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentOpsSettings as Settings } from "@/lib/agent-ops/settings";

/** Settings › Agents: quiet hours, automatic-run cap and free-memory floor, saved on change through /api/agent-ops/settings. */
export function AgentOpsSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/agent-ops/settings", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { settings?: Settings; error?: string };
        if (!response.ok || !data.settings) throw new Error(data.error ?? `HTTP ${response.status}`);
        setSettings(data.settings);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => controller.abort();
  }, []);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    try {
      const response = await fetch("/api/agent-ops/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json() as { settings?: Settings; error?: string };
      if (!response.ok || !data.settings) throw new Error(data.error ?? `HTTP ${response.status}`);
      setSettings(data.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // An incomplete window is not sent: the server needs both ends, or null to clear.
  const saveQuiet = (from: string, to: string) => {
    if (from && to) void save({ quietHours: { from, to } });
    else if (!from && !to) void save({ quietHours: null });
    else setSettings((current) => current && { ...current, quietHours: { from, to } });
  };

  const quiet = settings?.quietHours;
  return (
    <div className="agents-feature-setting">
      <div className="agents-feature-copy">
        <strong>{t("agentOps.settings.title")}</strong>
        <span>{t("agentOps.settings.description")}</span>
        <span>{t("agentOps.settings.quietHint")}</span>
        {error && <span role="alert" className="agents-feature-reload-notice">{t("agentOps.settings.error", { error })}</span>}
      </div>
      <div className="agents-feature-actions">
        <label className="agents-concurrency-control">
          <span>{t("agentOps.settings.quietFrom")}</span>
          <input type="time" value={quiet?.from ?? ""} disabled={!settings} onChange={(event) => saveQuiet(event.target.value, quiet?.to ?? "")} />
        </label>
        <label className="agents-concurrency-control">
          <span>{t("agentOps.settings.quietTo")}</span>
          <input type="time" value={quiet?.to ?? ""} disabled={!settings} onChange={(event) => saveQuiet(quiet?.from ?? "", event.target.value)} />
        </label>
        <label className="agents-concurrency-control">
          <span>{t("agentOps.settings.maxRuns")}</span>
          <input type="number" min={1} max={8} step={1} value={settings?.maxAutomaticRuns ?? ""} disabled={!settings}
            onChange={(event) => setSettings((current) => current && { ...current, maxAutomaticRuns: Number(event.target.value) })}
            onBlur={() => settings && void save({ maxAutomaticRuns: settings.maxAutomaticRuns })} />
        </label>
        <label className="agents-concurrency-control">
          <span>{t("agentOps.settings.minFreeMb")}</span>
          <input type="number" min={0} step={100} value={settings?.minFreeMb ?? ""} disabled={!settings}
            onChange={(event) => setSettings((current) => current && { ...current, minFreeMb: Number(event.target.value) })}
            onBlur={() => settings && void save({ minFreeMb: settings.minFreeMb })} />
        </label>
      </div>
    </div>
  );
}
