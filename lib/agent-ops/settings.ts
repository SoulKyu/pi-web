import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { AGENT_NAME_RE } from "../agents/registry";

export interface QuietHours { from: string; to: string }
export interface AgentOpsSettings { maxAutomaticRuns: number; minFreeMb: number; paused: boolean; pausedAgents: string[]; quietHours?: QuietHours; /** Queued `agent_remind` reminders per agent. */ maxPendingReminders: number }
export const DEFAULT_AGENT_OPS_SETTINGS: AgentOpsSettings = { maxAutomaticRuns: 2, minFreeMb: 1500, paused: false, pausedAgents: [], maxPendingReminders: 5 };
const MAX_AUTOMATIC_RUNS = 8;
const MAX_PENDING_REMINDERS = 50;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const agentOpsSettingsPath = (agentDir = getAgentDir()): string => join(agentDir, "agent-ops", "settings.json");

export function validateAgentOpsSettingsPatch(body: unknown): { ok: true; patch: Partial<AgentOpsSettings> } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Invalid JSON body" };
  const patch: Partial<AgentOpsSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    switch (key) {
      case "maxAutomaticRuns": if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_AUTOMATIC_RUNS) return { ok: false, error: `maxAutomaticRuns must be an integer from 1 to ${MAX_AUTOMATIC_RUNS}` }; patch.maxAutomaticRuns = value as number; break;
      case "minFreeMb": if (!Number.isInteger(value) || (value as number) < 0) return { ok: false, error: "minFreeMb must be an integer >= 0" }; patch.minFreeMb = value as number; break;
      case "maxPendingReminders": if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_PENDING_REMINDERS) return { ok: false, error: `maxPendingReminders must be an integer from 1 to ${MAX_PENDING_REMINDERS}` }; patch.maxPendingReminders = value as number; break;
      case "paused": if (typeof value !== "boolean") return { ok: false, error: "paused must be a boolean" }; patch.paused = value; break;
      case "pausedAgents": if (!Array.isArray(value) || !value.every((n) => typeof n === "string" && AGENT_NAME_RE.test(n))) return { ok: false, error: "pausedAgents must be a list of agent names" }; patch.pausedAgents = [...new Set(value as string[])]; break;
      case "quietHours":
        if (value === null || value === undefined) { patch.quietHours = undefined; break; }
        if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string" || !HHMM.test(value.from) || !HHMM.test(value.to)) return { ok: false, error: "quietHours must be { from: HH:MM, to: HH:MM }" };
        patch.quietHours = { from: value.from, to: value.to }; break;
      default: return { ok: false, error: `unknown field: ${key}` };
    }
  }
  return { ok: true, patch };
}

export function readAgentOpsSettings(path = agentOpsSettingsPath()): AgentOpsSettings {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(raw)) return { ...DEFAULT_AGENT_OPS_SETTINGS };
    // Key by key: one bad or unknown key must not reset `paused` to false.
    const kept: Partial<AgentOpsSettings> = {};
    for (const [key, value] of Object.entries(raw)) {
      const checked = validateAgentOpsSettingsPatch({ [key]: value });
      if (checked.ok) Object.assign(kept, checked.patch);
    }
    return { ...DEFAULT_AGENT_OPS_SETTINGS, ...kept };
  } catch { return { ...DEFAULT_AGENT_OPS_SETTINGS }; }
}

export function updateAgentOpsSettings(patch: Partial<Omit<AgentOpsSettings, "quietHours">> & { quietHours?: QuietHours | null }, path = agentOpsSettingsPath()): AgentOpsSettings {
  const next = { ...readAgentOpsSettings(path), ...patch };
  if (next.quietHours == null) delete next.quietHours;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writePrivateFileAtomicSync(path, JSON.stringify(next, null, 2));
  return next as AgentOpsSettings;
}

export const isPausedFor = (settings: AgentOpsSettings, agent?: string): boolean => settings.paused || (agent !== undefined && settings.pausedAgents.includes(agent));
