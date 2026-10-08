import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { agentHome, resolveLongTermProfile } from "../agents/registry";
import { TRIGGER_TOOL_NAMES } from "./trigger-tools";
import { feedUrlError } from "./feed";
import { PAYLOAD_FORMATS, type PayloadFormat } from "./payload-formats";
import { splitModel } from "../agents/agent-view";
import type { SubagentProfile, SubagentScope } from "../subagents";

export interface TriggerConfig {
  /** `profile` is the long-term agent the trigger belongs to; its runs happen in the agent home. */
  id: string; name: string; profile: string; enabled: boolean;
  /** Fire interval in minutes (v1 scheduler). Absent for pure-webhook triggers. */
  everyMinutes?: number;
  /** Daily fire time, local server clock `HH:MM`; may coexist with `everyMinutes`. */
  at?: string;
  /** Ignores quiet hours: scheduled fires run and webhook tasks are not deferred. */
  critical?: boolean;
  /** How a webhook body is read: `raw` (default), or an alerts[] mapper that dedups on fingerprints and reports severity. */
  payloadFormat?: PayloadFormat;
  /** Polled every `everyMinutes`: new entries of the feed become one isolated task per poll. The server fetches it; the agent's egress policy does not apply. */
  source?: { kind: "feed"; url: string };
  promptTemplate: string;
  /** Hex sha256 of the webhook secret: the plaintext is shown once at creation or rotation and never stored.
   *  A trigger file still holding a plaintext `webhookSecret` has no digest, so its webhook is refused until rotated. */
  webhookSecretSha256?: string;
  /** Must be > 0, else the dedup bucket is Infinity. */
  dedupWindowMs: number;
  /** Ingestion is refused while this many tasks of the trigger are queued or running. */
  maxActiveTasks: number;
  /** Fires, webhook ingestions and manual runs are refused once this many tasks of the trigger were created since local midnight; absent = unlimited. */
  maxRunsPerDay?: number;
  /** Schedule triggers only (default thread); a webhook trigger always runs isolated. */
  runTarget?: "thread" | "isolated";
  /** `provider/modelId` for isolated runs; absent = the agent's own model. */
  model?: string;
  /** Strict subset of TRIGGER_TOOL_ALLOWLIST for isolated runs; absent = the whole allowlist. It can only shrink. */
  tools?: string[];
  /** Run duration cap in ms for this trigger's tasks (60 s..1 h); absent = the runner default. */
  maxRunMs?: number;
  /** The exact profile the trigger was validated against. Only contentSha256 is compared:
   *  identical content means identical behavior, so a global↔project move with the same bytes is accepted on purpose.
   *  Built-ins have no filePath and pin the resolved snapshot. */
  pinnedProfile: { scope: SubagentScope; filePath?: string; contentSha256: string };
}

function sha256Of(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export const hashWebhookSecret = (secret: string): string => sha256Of(secret);

/** Closed allowlist. A blocklist (bash/write/edit/powershell) misses every extension tool
 *  that runs code: a subagent tool spawning a child with bash, an MCP adapter, an
 *  interactive shell. Anything not listed here is refused. */
export const TRIGGER_TOOL_ALLOWLIST: ReadonlySet<string> = new Set<string>(TRIGGER_TOOL_NAMES);

/** Authoritative check, run in start() on the tools the session actually activated
 *  (`get_tools`, lib/rpc-manager.ts:1104), extension tools included. */
export function checkActiveTriggerTools(activeTools: readonly string[], allowed: ReadonlySet<string> = TRIGGER_TOOL_ALLOWLIST): string | null {
  const outside = activeTools.filter((t) => !TRIGGER_TOOL_ALLOWLIST.has(t) || !allowed.has(t)); // a hand-edited subset can only shrink the closed allowlist
  return outside.length ? `trigger run refused: tools outside the allowlist: ${outside.join(", ")}` : null;
}

/** Pin hash: file-backed profiles hash their file; built-ins hash the resolved snapshot. */
export function profilePinSha256(profile: SubagentProfile): string {
  if (profile.filePath) return sha256Of(readFileSync(profile.filePath));
  return sha256Of(JSON.stringify({
    systemPrompt: profile.systemPrompt, tools: profile.tools, extensionTools: profile.extensionTools,
    loadSkills: profile.loadSkills, loadExtensions: profile.loadExtensions,
    model: profile.model, maxTurns: profile.maxTurns,
  }));
}

export const triggerHome = (trigger: Pick<TriggerConfig, "profile">): string => agentHome(trigger.profile);

export type TriggerPinStatus = "ok" | "drift" | "missing";

/** The scheduler's admission check, as a status: the agent's global profile against its pin (never a project file: the agent can write its own home).
 *  Never throws: an unresolvable profile or an unreadable profile file is "missing". */
export function triggerPinStatus(trigger: Pick<TriggerConfig, "profile" | "pinnedProfile">): TriggerPinStatus {
  try {
    const resolved = resolveLongTermProfile(trigger.profile);
    if (!resolved) return "missing";
    return profilePinSha256(resolved) === trigger.pinnedProfile.contentSha256 ? "ok" : "drift";
  } catch {
    return "missing";
  }
}

/** The run is narrowed to the allowlist by `agentProfileTools` and re-checked on `get_tools`, so the profile keeps its full preset. */
export function validateTriggerProfile(profile: SubagentProfile): string | null {
  return profile.longTerm ? null : "triggers belong to long-term agents";
}

/** Fail closed on origin: only a trigger task runs pinned, and it must carry its pin. */
export function triggerRunPin(task: { origin: string; pinnedProfileSha256?: string }): string | undefined {
  if (task.origin !== "trigger") return undefined;
  if (!task.pinnedProfileSha256) throw new Error("trigger task without a profile pin");
  return task.pinnedProfileSha256;
}

export type TriggerInput = Pick<TriggerConfig, "name" | "profile" | "promptTemplate">
  & Partial<Pick<TriggerConfig, "enabled" | "everyMinutes" | "at" | "critical" | "dedupWindowMs" | "maxActiveTasks" | "maxRunsPerDay" | "runTarget" | "model" | "tools" | "maxRunMs" | "payloadFormat" | "source">>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_RUN_MS = 60_000;
const MAX_RUN_MS = 3_600_000;

/** Field checks that need no profile lookup, so an edit of a trigger whose profile vanished can still be validated. */
export function validateTriggerFields(input: TriggerInput): string | null {
  for (const field of ["name", "profile", "promptTemplate"] as const) {
    if (typeof input[field] !== "string" || !input[field].trim()) return `${field} is required`;
  }
  // Secrets are generated by the server (trigger-api.ts) so the client never chooses a weak one.
  if ((input as { webhookSecret?: unknown }).webhookSecret !== undefined) return "webhookSecret is generated by the server";
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") return "enabled must be a boolean";
  // An explicit null must not fall through to the defaults below: it would be saved as is.
  for (const field of ["dedupWindowMs", "maxActiveTasks", "everyMinutes"] as const) {
    if (input[field] === null) return `${field} must be a number`;
  }
  if (input.at !== undefined && (typeof input.at !== "string" || !HHMM.test(input.at))) return "at must be HH:MM";
  if (input.critical !== undefined && typeof input.critical !== "boolean") return "critical must be a boolean";
  if (input.payloadFormat !== undefined && !PAYLOAD_FORMATS.includes(input.payloadFormat)) return "payloadFormat must be raw, alertmanager or grafana";
  if (input.runTarget !== undefined && input.runTarget !== "thread" && input.runTarget !== "isolated") return "runTarget must be thread or isolated";
  if (input.model !== undefined && (typeof input.model !== "string" || !splitModel(input.model))) return "model must be provider/modelId";
  if (input.tools !== undefined && (!Array.isArray(input.tools) || !input.tools.length || input.tools.some((t) => !TRIGGER_TOOL_ALLOWLIST.has(t)))) {
    return "tools must be a subset of the trigger allowlist";
  }
  if (input.maxRunMs !== undefined && (!Number.isInteger(input.maxRunMs) || input.maxRunMs < MIN_RUN_MS || input.maxRunMs > MAX_RUN_MS)) {
    return `maxRunMs must be an integer between ${MIN_RUN_MS} and ${MAX_RUN_MS}`;
  }
  if (input.source !== undefined) {
    const source = input.source as { kind?: unknown; url?: unknown } | null;
    if (typeof source !== "object" || source === null || Array.isArray(source) || source.kind !== "feed") return "source.kind must be feed";
    const urlError = feedUrlError(source.url);
    if (urlError) return urlError;
    if (input.everyMinutes === undefined) return "a feed source needs everyMinutes";
  }
  const dedupWindowMs = input.dedupWindowMs ?? 15 * 60_000;
  if (!(dedupWindowMs > 0) || !Number.isFinite(dedupWindowMs)) return "dedupWindowMs must be greater than 0";
  const maxActiveTasks = input.maxActiveTasks ?? 1;
  if (!Number.isInteger(maxActiveTasks) || maxActiveTasks < 1) return "maxActiveTasks must be an integer >= 1";
  if (input.maxRunsPerDay !== undefined && (!Number.isInteger(input.maxRunsPerDay) || input.maxRunsPerDay < 1)) return "maxRunsPerDay must be an integer >= 1";
  if (input.everyMinutes !== undefined && (!Number.isInteger(input.everyMinutes) || input.everyMinutes < 1)) return "everyMinutes must be an integer >= 1";
  return null;
}

export function buildTriggerConfig(
  input: TriggerInput,
  resolveProfile: (name: string) => SubagentProfile | null | undefined,
): { ok: true; trigger: TriggerConfig } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const invalid = validateTriggerFields(input);
  if (invalid) return fail(invalid);
  const profile = resolveProfile(input.profile);
  if (!profile) return fail(`profile not found: ${input.profile}`);
  const refusal = validateTriggerProfile(profile);
  if (refusal) return fail(refusal);
  let contentSha256: string;
  try { contentSha256 = profilePinSha256(profile); } catch { return fail(`profile unreadable: ${input.profile}`); } // file vanished after resolve
  return {
    ok: true,
    trigger: {
      id: randomUUID(), name: input.name, profile: input.profile,
      enabled: input.enabled ?? true,
      ...(input.everyMinutes !== undefined ? { everyMinutes: input.everyMinutes } : {}),
      promptTemplate: input.promptTemplate,
      ...(input.at !== undefined ? { at: input.at } : {}),
      ...(input.critical !== undefined ? { critical: input.critical } : {}),
      ...(input.payloadFormat !== undefined ? { payloadFormat: input.payloadFormat } : {}),
      ...(input.source !== undefined ? { source: { kind: "feed" as const, url: input.source.url } } : {}),
      ...(input.runTarget !== undefined ? { runTarget: input.runTarget } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.tools !== undefined ? { tools: [...new Set(input.tools)] } : {}),
      ...(input.maxRunMs !== undefined ? { maxRunMs: input.maxRunMs } : {}),
      ...(input.maxRunsPerDay !== undefined ? { maxRunsPerDay: input.maxRunsPerDay } : {}),
      dedupWindowMs: input.dedupWindowMs ?? 15 * 60_000, maxActiveTasks: input.maxActiveTasks ?? 1,
      pinnedProfile: { scope: profile.scope, ...(profile.filePath ? { filePath: profile.filePath } : {}), contentSha256 },
    },
  };
}

const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function triggersDir(): string { return join(getAgentDir(), "agent-ops", "triggers"); }
function triggerPath(id: string): string { return join(triggersDir(), `${id}.json`); }
export function getTrigger(id: string): TriggerConfig | null {
  if (!VALID_ID.test(id)) return null;
  try {
    const raw = JSON.parse(readFileSync(triggerPath(id), "utf8")) as TriggerConfig;
    return raw?.id === id ? raw : null;
  } catch { return null; }
}
/** Only `<uuid>.json`: the same directory later holds the fire tokens. */
export function listTriggers(): TriggerConfig[] {
  if (!existsSync(triggersDir())) return [];
  return readdirSync(triggersDir()).filter((f) => f.endsWith(".json"))
    .map((f) => getTrigger(f.slice(0, -5))).filter((t): t is TriggerConfig => t !== null);
}
export function saveTrigger(trigger: TriggerConfig): void {
  if (!VALID_ID.test(trigger.id)) throw new Error("invalid trigger id");
  mkdirSync(triggersDir(), { recursive: true, mode: 0o700 });
  writePrivateFileAtomicSync(triggerPath(trigger.id), JSON.stringify(trigger, null, 2));
}
/** The feed poll state (`<id>.feed.json`: validators and seen hashes); gone with the trigger or when its URL changes. */
export function clearFeedState(id: string): void {
  try { unlinkSync(join(triggersDir(), `${id}.feed.json`)); } catch { /* absent */ }
}
export function deleteTrigger(id: string): boolean {
  if (!VALID_ID.test(id)) return false;
  let deleted = false;
  try { unlinkSync(triggerPath(id)); deleted = true; } catch { /* deleted stays false */ }
  // Also remove the trigger's journal: absent is normal, failures are silent.
  try { unlinkSync(join(triggersDir(), `${id}.log.jsonl`)); } catch { /* absent */ }
  clearFeedState(id);
  return deleted;
}
