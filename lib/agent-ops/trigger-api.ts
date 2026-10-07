import { randomBytes } from "node:crypto";
import { resolveLongTermProfile } from "../agents/registry";
import {
  buildTriggerConfig, deleteTrigger, getTrigger, hashWebhookSecret, listTriggers, saveTrigger, validateTriggerFields,
  triggerPinStatus, type TriggerConfig, type TriggerInput, type TriggerPinStatus,
} from "./trigger-store";

/** What leaves the server: the secret is shown once at creation or rotation, never again. */
export type PublicTrigger = Omit<TriggerConfig, "webhookSecretSha256"> & { hasWebhookSecret: boolean; pinStatus: TriggerPinStatus };

export type TriggerApiResult<T> = ({ ok: true } & T) | { ok: false; status: 400 | 404; error: string };

/** Not a stored field: `repin: true` re-resolves the profile and renews the pin. */
const PATCH_ONLY_FIELDS = ["repin"] as const;
const EDITABLE_FIELDS = ["name", "profile", "promptTemplate", "enabled", "everyMinutes", "at", "critical", "dedupWindowMs", "maxActiveTasks", "runTarget", "model", "tools", "maxRunMs", "payloadFormat"] as const;
/** Optional fields a PATCH clears with an explicit null. */
const CLEARABLE_FIELDS = ["at", "critical", "runTarget", "model", "tools", "maxRunMs", "payloadFormat"] as const;
const NOT_FOUND = { ok: false, status: 404, error: "Trigger not found" } as const;
const refuse = (error: string) => ({ ok: false, status: 400, error }) as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function toPublicTrigger(trigger: TriggerConfig): PublicTrigger {
  // `webhookSecret` is the legacy plaintext field of older files: it must not leave the server either.
  const view: Partial<TriggerConfig> & { webhookSecret?: unknown } = { ...trigger };
  delete view.webhookSecretSha256;
  delete view.webhookSecret;
  return { ...(view as Omit<PublicTrigger, "hasWebhookSecret" | "pinStatus">), hasWebhookSecret: Boolean(trigger.webhookSecretSha256), pinStatus: triggerPinStatus(trigger) };
}

export function listPublicTriggers(): PublicTrigger[] {
  return listTriggers().map(toPublicTrigger);
}

const generateWebhookSecret = (): string => randomBytes(32).toString("base64url");

// The global profile only: an agent that can write its home must not shadow its profile through a project file.
const resolveIn = (name: string) => resolveLongTermProfile(name);

/** `webhookSecret` is forwarded on purpose: the store refuses a client-supplied one. */
export function createTriggerFromInput(body: unknown): TriggerApiResult<{ trigger: PublicTrigger; webhookSecret?: string }> {
  if (!isRecord(body)) return refuse("Invalid JSON body");
  if (body.webhook !== undefined && typeof body.webhook !== "boolean") return refuse("webhook must be a boolean");
  const input: Record<string, unknown> = {};
  for (const field of [...EDITABLE_FIELDS, "webhookSecret"]) if (body[field] !== undefined) input[field] = body[field];
  const invalid = validateTriggerFields(input as unknown as TriggerInput);
  if (invalid) return refuse(invalid);
  const built = buildTriggerConfig(input as unknown as TriggerInput, resolveIn);
  if (!built.ok) return refuse(built.error);
  const webhookSecret = body.webhook ? generateWebhookSecret() : undefined;
  const trigger = webhookSecret ? { ...built.trigger, webhookSecretSha256: hashWebhookSecret(webhookSecret) } : built.trigger;
  saveTrigger(trigger);
  return { ok: true, trigger: toPublicTrigger(trigger), ...(webhookSecret ? { webhookSecret } : {}) };
}

/** Edits keep id and secret. The profile pin is renewed only when the profile changes,
 *  or on an explicit `repin: true` (the creation checks run again, so a profile that now has disallowed tools is refused),
 *  so an unrelated edit or a toggle never silently accepts a drifted profile. `everyMinutes: null` removes the schedule. */
export function patchTrigger(id: string, body: unknown): TriggerApiResult<{ trigger: PublicTrigger }> {
  const existing = getTrigger(id);
  if (!existing) return NOT_FOUND;
  if (!isRecord(body)) return refuse("Invalid JSON body");
  const unknown = Object.keys(body).find((key) => ![...EDITABLE_FIELDS, ...PATCH_ONLY_FIELDS].includes(key as never));
  if (unknown) return refuse(`unknown field: ${unknown}`);
  if (body.repin !== undefined && typeof body.repin !== "boolean") return refuse("repin must be a boolean");
  const merged: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) merged[field] = field in body ? body[field] : existing[field];
  const clearSchedule = body.everyMinutes === null;
  if (clearSchedule || merged.everyMinutes === undefined) delete merged.everyMinutes;
  const cleared = CLEARABLE_FIELDS.filter((field) => merged[field] === null || merged[field] === undefined);
  for (const field of cleared) delete merged[field];
  const invalid = validateTriggerFields(merged as unknown as TriggerInput);
  if (invalid) return refuse(invalid);
  const updated: TriggerConfig = { ...existing, ...(merged as unknown as Omit<TriggerInput, "webhookSecret">) };
  if (clearSchedule) delete updated.everyMinutes;
  for (const field of cleared) delete updated[field];
  if (merged.tools) updated.tools = [...new Set(merged.tools as string[])];
  if (body.repin === true || updated.profile !== existing.profile) {
    const built = buildTriggerConfig(merged as unknown as TriggerInput, resolveIn);
    if (!built.ok) return refuse(built.error);
    updated.pinnedProfile = built.trigger.pinnedProfile;
  }
  saveTrigger(updated);
  return { ok: true, trigger: toPublicTrigger(updated) };
}

/** Profile settings saved: renew the pin of every trigger of the agent. An authenticated edit is the drift the pin exists to catch, so it is accepted here, never by the scheduler. */
export function repinTriggersOfAgent(name: string): number {
  let count = 0;
  for (const trigger of listTriggers().filter((candidate) => candidate.profile === name)) {
    const built = buildTriggerConfig({ ...trigger }, resolveIn);
    if (!built.ok) continue; // a profile that vanished keeps its old pin and shows "missing"
    saveTrigger({ ...trigger, pinnedProfile: built.trigger.pinnedProfile });
    count += 1;
  }
  return count;
}

export function deleteTriggersOfAgent(name: string): number {
  return listTriggers().filter((trigger) => trigger.profile === name).filter((trigger) => deleteTrigger(trigger.id)).length;
}

/** Only the digest is stored. The old secret stops working at once. Also gives a first secret to a trigger created without a webhook. */
export function rotateSecret(id: string): TriggerApiResult<{ trigger: PublicTrigger; webhookSecret: string }> {
  const existing = getTrigger(id);
  if (!existing) return NOT_FOUND;
  const webhookSecret = generateWebhookSecret();
  const trigger: TriggerConfig & { webhookSecret?: unknown } = { ...existing, webhookSecretSha256: hashWebhookSecret(webhookSecret) };
  delete trigger.webhookSecret; // a rotation also drops a legacy plaintext
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
