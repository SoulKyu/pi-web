import { createHash, timingSafeEqual } from "node:crypto";
import {
  createAuthThrottleState, getAuthRetryAfterMs, recordAuthFailure, retryAfterSeconds, type AuthThrottleState,
} from "../auth-throttle";
import { ingestTriggerPayload } from "./scheduler";
import { getTrigger } from "./trigger-store";

/** Header carrying the trigger's shared secret. */
export const HOOK_SECRET_HEADER = "x-agent-ops-secret";
export const HOOK_BODY_MAX_BYTES = 64 * 1024;

declare global { var __agentOpsHookThrottle: AuthThrottleState | undefined; }
/** Dedicated state: wrong secrets on this exposed route must not raise the browser login's backoff. */
export const hookThrottle = (): AuthThrottleState => (globalThis.__agentOpsHookThrottle ??= createAuthThrottleState());

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();
const json = (body: unknown, status: number, headers?: Record<string, string>): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Reads at most `max` bytes from the stream itself: content-length is client-declared and not trusted. null when over the cap. */
async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { void reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isJsonContent(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

/** Fail closed: no secret configured, no way in. Never echoes the secret or the payload. */
export async function handleHook(request: Request, id: string, kick: () => unknown): Promise<Response> {
  const retryAfterMs = getAuthRetryAfterMs(Date.now(), hookThrottle());
  if (retryAfterMs > 0) return json({ error: "Too many failed attempts" }, 429, { "Retry-After": String(retryAfterSeconds(retryAfterMs)) });
  const fail = (error: string, status: number): Response => { recordAuthFailure(Date.now(), hookThrottle()); return json({ error }, status); };

  const trigger = getTrigger(id);
  if (!trigger) return fail("Not found", 404); // counted: ids cannot be probed freely
  if (!trigger.webhookSecret) return fail("Webhook not enabled for this trigger", 403); // before any comparison
  // Digests have equal length; raw buffers of different lengths make timingSafeEqual throw.
  if (!timingSafeEqual(sha256(request.headers.get(HOOK_SECRET_HEADER) ?? ""), sha256(trigger.webhookSecret))) return fail("Unauthorized", 401);

  const text = await readCapped(request.body, HOOK_BODY_MAX_BYTES);
  if (text === null) return json({ error: "Payload too large" }, 413);
  let body: unknown = { text };
  if (isJsonContent(request)) {
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid JSON body" }, 400); }
  }
  const result = ingestTriggerPayload(trigger, body);
  if (!result.accepted) return json({ reason: result.reason }, 409);
  void kick();
  return json({ taskId: result.taskId }, 202);
}
