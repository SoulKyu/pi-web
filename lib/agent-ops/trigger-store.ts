import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { resolveSubagentProfile, type SubagentProfile, type SubagentScope } from "../subagents";

export interface TriggerConfig {
  id: string; name: string; profile: string; cwd: string; enabled: boolean;
  /** Fire interval in minutes (v1 scheduler). Absent for pure-webhook triggers. */
  everyMinutes?: number;
  promptTemplate: string;
  /** Hex sha256 of the webhook secret: the plaintext is shown once at creation or rotation and never stored.
   *  A trigger file still holding a plaintext `webhookSecret` has no digest, so its webhook is refused until rotated. */
  webhookSecretSha256?: string;
  /** Must be > 0, else the dedup bucket is Infinity. */
  dedupWindowMs: number;
  /** Ingestion is refused while this many tasks of the trigger are queued or running. */
  maxActiveTasks: number;
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
export const TRIGGER_TOOL_ALLOWLIST: ReadonlySet<string> = new Set(["read", "grep", "find", "ls", "memory_search", "memory_save"]);

/** Authoritative check, run in start() on the tools the session actually activated
 *  (`get_tools`, lib/rpc-manager.ts:1104), extension tools included. */
export function checkActiveTriggerTools(activeTools: readonly string[]): string | null {
  const outside = activeTools.filter((t) => !TRIGGER_TOOL_ALLOWLIST.has(t));
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

export type TriggerPinStatus = "ok" | "drift" | "missing";

/** The scheduler's admission check, as a status: the profile as resolved in the trigger's cwd against its pin.
 *  Never throws: an unresolvable profile or an unreadable profile file is "missing". */
export function triggerPinStatus(trigger: Pick<TriggerConfig, "cwd" | "profile" | "pinnedProfile">): TriggerPinStatus {
  try {
    const resolved = resolveSubagentProfile(trigger.cwd, trigger.profile);
    if (!resolved) return "missing";
    return profilePinSha256(resolved) === trigger.pinnedProfile.contentSha256 ? "ok" : "drift";
  } catch {
    return "missing";
  }
}

/** Creation-time check on the DECLARED tools, as an early refusal. It cannot see extension
 *  tools: resolveProfileActiveTools needs loaded extensions (lib/subagent-runtime.ts:156-168),
 *  which only exist inside a session. start() re-checks the real surface. */
export function validateTriggerProfile(profile: SubagentProfile): string | null {
  const declared = [...profile.tools, ...(profile.extensionTools ?? [])];
  const outside = declared.filter((t) => !TRIGGER_TOOL_ALLOWLIST.has(t));
  if (outside.length) return `trigger profiles may only use: ${[...TRIGGER_TOOL_ALLOWLIST].join(", ")} (found: ${outside.join(", ")})`;
  // Without an explicit list, loadExtensions activates every extension tool.
  if (profile.loadExtensions && !(profile.extensionTools?.length)) {
    return "trigger profiles must declare an explicit extensionTools allowlist (e.g. memory_search, memory_save)";
  }
  return null;
}

/** Fail closed on origin: only a trigger task runs pinned, and it must carry its pin. */
export function triggerRunPin(task: { origin: string; pinnedProfileSha256?: string }): string | undefined {
  if (task.origin !== "trigger") return undefined;
  if (!task.pinnedProfileSha256) throw new Error("trigger task without a profile pin");
  return task.pinnedProfileSha256;
}

export type TriggerInput = Pick<TriggerConfig, "name" | "profile" | "cwd" | "promptTemplate">
  & Partial<Pick<TriggerConfig, "enabled" | "everyMinutes" | "dedupWindowMs" | "maxActiveTasks">>;

/** Field checks that need no profile lookup, so an edit of a trigger whose profile vanished can still be validated. */
export function validateTriggerFields(input: TriggerInput): string | null {
  for (const field of ["name", "profile", "promptTemplate", "cwd"] as const) {
    if (typeof input[field] !== "string" || !input[field].trim()) return `${field} is required`;
  }
  // Secrets are generated by the server (trigger-api.ts) so the client never chooses a weak one.
  if ((input as { webhookSecret?: unknown }).webhookSecret !== undefined) return "webhookSecret is generated by the server";
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") return "enabled must be a boolean";
  // An explicit null must not fall through to the defaults below: it would be saved as is.
  for (const field of ["dedupWindowMs", "maxActiveTasks", "everyMinutes"] as const) {
    if (input[field] === null) return `${field} must be a number`;
  }
  const dedupWindowMs = input.dedupWindowMs ?? 15 * 60_000;
  if (!(dedupWindowMs > 0) || !Number.isFinite(dedupWindowMs)) return "dedupWindowMs must be greater than 0";
  const maxActiveTasks = input.maxActiveTasks ?? 1;
  if (!Number.isInteger(maxActiveTasks) || maxActiveTasks < 1) return "maxActiveTasks must be an integer >= 1";
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
      id: randomUUID(), name: input.name, profile: input.profile, cwd: input.cwd,
      enabled: input.enabled ?? true,
      ...(input.everyMinutes !== undefined ? { everyMinutes: input.everyMinutes } : {}),
      promptTemplate: input.promptTemplate,
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
export function deleteTrigger(id: string): boolean {
  if (!VALID_ID.test(id)) return false;
  try { unlinkSync(triggerPath(id)); return true; } catch { return false; }
}
