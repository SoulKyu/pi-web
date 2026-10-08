import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { feedUrlError, parseFeed, type FeedEntry } from "./feed";
import { triggersDir } from "./trigger-store";

export interface FeedState { etag?: string; lastModified?: string; /** hash16 of each seen entry, newest first. */ seen: string[] }
export type FeedFetch = { status: "unchanged" } | { status: "ok"; entries: FeedEntry[]; state: FeedState } | { status: "error"; reason: string };

export const FEED_MAX_BYTES = 1024 * 1024;
export const FEED_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_SEEN = 500;

export const hash16 = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 16);
export const entryHash = (entry: FeedEntry): string => hash16(entry.id || entry.link);
/** Fire token of one batch: a restart between the token and the state write cannot fire it twice. */
export const feedToken = (triggerId: string, batchHash: string): string => `${triggerId}.feed_${batchHash}`;

const statePath = (triggerId: string): string => join(triggersDir(), `${triggerId}.feed.json`);

export function readFeedState(triggerId: string): FeedState {
  try {
    const raw = JSON.parse(readFileSync(statePath(triggerId), "utf8")) as Partial<FeedState>;
    return {
      ...(typeof raw.etag === "string" ? { etag: raw.etag } : {}),
      ...(typeof raw.lastModified === "string" ? { lastModified: raw.lastModified } : {}),
      seen: Array.isArray(raw.seen) ? raw.seen.filter((hash): hash is string => typeof hash === "string").slice(0, MAX_SEEN) : [],
    };
  } catch { return { seen: [] }; }
}

export function writeFeedState(triggerId: string, state: FeedState): void {
  mkdirSync(triggersDir(), { recursive: true, mode: 0o700 });
  writePrivateFileAtomicSync(statePath(triggerId), JSON.stringify({ ...state, seen: state.seen.slice(0, MAX_SEEN) }));
}

/** Entries whose hash is not in `seen`, feed order. */
export const newEntries = (entries: readonly FeedEntry[], seen: readonly string[]): FeedEntry[] => {
  const known = new Set(seen);
  return entries.filter((entry) => !known.has(entryHash(entry)));
};

/** Newest first, no duplicates, bounded. */
export const markSeen = (seen: readonly string[], hashes: readonly string[]): string[] => [...new Set([...hashes, ...seen])].slice(0, MAX_SEEN);

async function readCapped(response: Response): Promise<string | null> {
  if (!response.body) { const body = await response.text(); return body.length > FEED_MAX_BYTES ? null : body; }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > FEED_MAX_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The server fetches the feed (the agent's egress policy does not apply). Conditional GET from `state`; redirects are followed by hand and must stay https. */
export async function fetchFeed(url: string, state: FeedState, deps: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<FeedFetch> {
  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? FEED_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5" };
    if (state.etag) headers["If-None-Match"] = state.etag;
    if (state.lastModified) headers["If-Modified-Since"] = state.lastModified;
    let current = url;
    for (let hop = 0; ; hop++) {
      const invalid = feedUrlError(current);
      if (invalid) return { status: "error", reason: hop ? `redirect refused: ${invalid}` : invalid };
      const response = await doFetch(current, { redirect: "manual", headers, signal: controller.signal });
      if (response.status === 304) return { status: "unchanged" };
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) return { status: "error", reason: location ? "too many redirects" : "redirect without location" };
        try { current = new URL(location, current).href; } catch { return { status: "error", reason: "invalid redirect location" }; }
        continue;
      }
      if (!response.ok) return { status: "error", reason: `HTTP ${response.status}` };
      const body = await readCapped(response);
      if (body === null) return { status: "error", reason: `feed larger than ${FEED_MAX_BYTES} bytes` };
      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");
      return { status: "ok", entries: parseFeed(body), state: { ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}), seen: state.seen } };
    }
  } catch (error) {
    return { status: "error", reason: controller.signal.aborted ? "timeout" : error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
