import { createHash, timingSafeEqual } from "node:crypto";
import {
  createAuthThrottleState, getAuthRetryAfterMs, recordAuthFailure, retryAfterSeconds, type AuthThrottleState,
} from "../auth-throttle";
import { hasJsonContentType } from "../request-security";
import { HOOK_SECRET_HEADER } from "./hook-path";
import { ingestTriggerPayload } from "./scheduler";
import { getTrigger } from "./trigger-store";

export const HOOK_BODY_MAX_BYTES = 64 * 1024;

declare global {
  var __agentOpsHookThrottles: Map<string, AuthThrottleState> | undefined;
  var __agentOpsUnknownHookThrottle: AuthThrottleState | undefined;
}
const MAX_THROTTLE_ENTRIES = 256;
/** Dedicated states, never the browser login's: wrong secrets on this exposed route must not raise its backoff.
 *  One state per known trigger, so a flood aimed at one id (or at unknown ids, which share a separate state
 *  no known trigger consults) cannot block another trigger's alerts. */
export function hookThrottle(triggerId?: string): AuthThrottleState {
  if (!triggerId) return (globalThis.__agentOpsUnknownHookThrottle ??= createAuthThrottleState());
  const states = (globalThis.__agentOpsHookThrottles ??= new Map());
  let state = states.get(triggerId);
  if (!state) {
    // ponytail: entries exist only for ids of real triggers; past the cap, drop those of deleted triggers. Cap-sized scan per new trigger.
    if (states.size >= MAX_THROTTLE_ENTRIES) for (const id of states.keys()) if (!getTrigger(id)) states.delete(id);
    states.set(triggerId, state = createAuthThrottleState());
  }
  return state;
}

const HEX_SHA256 = /^[0-9a-f]{64}$/;
const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();
const json = (body: unknown, status: number, headers?: Record<string, string>): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Reads at most `max` bytes from the stream itself: content-length is client-declared and not trusted. null when over the cap. */
/** `undefined` when the stream fails (client gone mid-body). */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null | undefined> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { void reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Fail closed: no secret configured, no way in. Never echoes the secret or the payload. */
export async function handleHook(request: Request, id: string, kick: () => unknown): Promise<Response> {
  const trigger = getTrigger(id);
  const throttle = hookThrottle(trigger?.id);
  const retryAfterMs = getAuthRetryAfterMs(Date.now(), throttle);
  if (retryAfterMs > 0) return json({ error: "Too many failed attempts" }, 429, { "Retry-After": String(retryAfterSeconds(retryAfterMs)) });
  const fail = (error: string, status: number): Response => { recordAuthFailure(Date.now(), throttle); return json({ error }, status); };

  if (!trigger) return fail("Not found", 404); // counted on the shared unknown-id state: ids cannot be probed freely
  // Before any comparison. A legacy plaintext `webhookSecret` has no digest: refused until the secret is rotated.
  if (!trigger.webhookSecretSha256 || !HEX_SHA256.test(trigger.webhookSecretSha256)) return fail("Webhook not enabled for this trigger", 403);
  // Both are 32-byte digests; raw buffers of different lengths make timingSafeEqual throw.
  if (!timingSafeEqual(sha256(request.headers.get(HOOK_SECRET_HEADER) ?? ""), Buffer.from(trigger.webhookSecretSha256, "hex"))) return fail("Unauthorized", 401);

  const text = await readCapped(request.body, HOOK_BODY_MAX_BYTES);
  if (text === undefined) return json({ error: "Request body unreadable" }, 400);
  if (text === null) return json({ error: "Payload too large" }, 413);
  let body: unknown = { text };
  if (hasJsonContentType(request)) {
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid JSON body" }, 400); }
  }
  const result = ingestTriggerPayload(trigger, body);
  if (!result.accepted) return json({ reason: result.reason }, 409);
  void kick();
  return json({ taskId: result.taskId }, 202);
}
