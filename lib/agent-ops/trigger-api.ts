import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolveSubagentProfile } from "../subagents";
import {
  buildTriggerConfig, deleteTrigger, getTrigger, hashWebhookSecret, listTriggers, saveTrigger, validateTriggerFields,
  type TriggerConfig, type TriggerInput,
} from "./trigger-store";

/** What leaves the server: the secret is shown once at creation or rotation, never again. */
export type PublicTrigger = Omit<TriggerConfig, "webhookSecretSha256"> & { hasWebhookSecret: boolean };

export type TriggerApiResult<T> = ({ ok: true } & T) | { ok: false; status: 400 | 404; error: string };

const EDITABLE_FIELDS = ["name", "profile", "cwd", "promptTemplate", "enabled", "everyMinutes", "dedupWindowMs", "maxActiveTasks"] as const;
const NOT_FOUND = { ok: false, status: 404, error: "Trigger not found" } as const;
const refuse = (error: string) => ({ ok: false, status: 400, error }) as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function toPublicTrigger(trigger: TriggerConfig): PublicTrigger {
  // `webhookSecret` is the legacy plaintext field of older files: it must not leave the server either.
  const { webhookSecretSha256, webhookSecret: _legacy, ...rest } = trigger as TriggerConfig & { webhookSecret?: unknown };
  return { ...rest, hasWebhookSecret: Boolean(webhookSecretSha256) };
}

export function listPublicTriggers(): PublicTrigger[] {
  return listTriggers().map(toPublicTrigger);
}

const generateWebhookSecret = (): string => randomBytes(32).toString("base64url");

const resolveIn = (cwd: string) => (name: string) => resolveSubagentProfile(cwd, name);

/** `webhookSecret` is forwarded on purpose: the store refuses a client-supplied one. */
export function createTriggerFromInput(body: unknown): TriggerApiResult<{ trigger: PublicTrigger; webhookSecret?: string }> {
  if (!isRecord(body)) return refuse("Invalid JSON body");
  if (body.webhook !== undefined && typeof body.webhook !== "boolean") return refuse("webhook must be a boolean");
  const input: Record<string, unknown> = {};
  for (const field of [...EDITABLE_FIELDS, "webhookSecret"]) if (body[field] !== undefined) input[field] = body[field];
  const invalid = validateTriggerFields(input as unknown as TriggerInput);
  if (invalid) return refuse(invalid);
  const cwd = input.cwd as string;
  if (!existsSync(cwd)) return refuse(`Directory does not exist: ${cwd}`);
  const built = buildTriggerConfig(input as unknown as TriggerInput, resolveIn(cwd));
  if (!built.ok) return refuse(built.error);
  const webhookSecret = body.webhook ? generateWebhookSecret() : undefined;
  const trigger = webhookSecret ? { ...built.trigger, webhookSecretSha256: hashWebhookSecret(webhookSecret) } : built.trigger;
  saveTrigger(trigger);
  return { ok: true, trigger: toPublicTrigger(trigger), ...(webhookSecret ? { webhookSecret } : {}) };
}

/** Edits keep id and secret. The profile pin is renewed only when the profile or the cwd (which scopes project profiles) changes,
 *  so an unrelated edit or a toggle never silently accepts a drifted profile. `everyMinutes: null` removes the schedule. */
export function patchTrigger(id: string, body: unknown): TriggerApiResult<{ trigger: PublicTrigger }> {
  const existing = getTrigger(id);
  if (!existing) return NOT_FOUND;
  if (!isRecord(body)) return refuse("Invalid JSON body");
  const unknown = Object.keys(body).find((key) => !(EDITABLE_FIELDS as readonly string[]).includes(key));
  if (unknown) return refuse(`unknown field: ${unknown}`);
  const merged: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) merged[field] = field in body ? body[field] : existing[field];
  const clearSchedule = body.everyMinutes === null;
  if (clearSchedule || merged.everyMinutes === undefined) delete merged.everyMinutes;
  const invalid = validateTriggerFields(merged as unknown as TriggerInput);
  if (invalid) return refuse(invalid);
  const updated: TriggerConfig = { ...existing, ...(merged as unknown as Omit<TriggerInput, "webhookSecret">) };
  if (clearSchedule) delete updated.everyMinutes;
  if (updated.profile !== existing.profile || updated.cwd !== existing.cwd) {
    if (!existsSync(updated.cwd)) return refuse(`Directory does not exist: ${updated.cwd}`);
    const built = buildTriggerConfig(merged as unknown as TriggerInput, resolveIn(updated.cwd));
    if (!built.ok) return refuse(built.error);
    updated.pinnedProfile = built.trigger.pinnedProfile;
  }
  saveTrigger(updated);
  return { ok: true, trigger: toPublicTrigger(updated) };
}

/** Only the digest is stored. The old secret stops working at once. Also gives a first secret to a trigger created without a webhook. */
export function rotateSecret(id: string): TriggerApiResult<{ trigger: PublicTrigger; webhookSecret: string }> {
  const existing = getTrigger(id);
  if (!existing) return NOT_FOUND;
  const webhookSecret = generateWebhookSecret();
  const { webhookSecret: _legacy, ...kept } = existing as TriggerConfig & { webhookSecret?: unknown }; // a rotation also drops a legacy plaintext
  const trigger = { ...kept, webhookSecretSha256: hashWebhookSecret(webhookSecret) };
  saveTrigger(trigger);
  globalThis.__agentOpsHookThrottles?.delete(id); // failures with the old secret must not lock the new one out
  return { ok: true, trigger: toPublicTrigger(trigger), webhookSecret };
}

export function deleteTriggerById(id: string): TriggerApiResult<object> {
  return deleteTrigger(id) ? { ok: true } : NOT_FOUND;
}

/** One JSON shape for every trigger route; `no-store` because a response may carry a fresh secret. */
export function triggerResponse(result: TriggerApiResult<object>, successStatus = 200): Response {
  const headers = { "Cache-Control": "no-store" };
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers });
  return Response.json({ ...result, ok: undefined }, { status: successStatus, headers });
}

export const unexpectedErrorResponse = (error: unknown): Response =>
  Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: { "Cache-Control": "no-store" } });
