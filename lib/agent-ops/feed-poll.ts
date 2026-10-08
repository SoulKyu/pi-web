import { fenceExternal } from "../agents/fence";
import { entryHash, feedToken, fetchFeed, hash16, markSeen, newEntries, readFeedState, writeFeedState } from "./feed-source";
import type { FeedEntry } from "./feed";
import { appendTriggerLog } from "./trigger-log";
import type { TriggerConfig } from "./trigger-store";

/** Entries per task; the rest wait for the next poll. */
export const FEED_BATCH = 10;

export interface FeedPollDeps {
  /** Admission, budget, quiet hours and caps exactly as a scheduled fire: false (and journaled by the caller) = skip this bucket's poll. */
  admit: (trigger: TriggerConfig, bucket: number) => boolean;
  /** Exclusive fire token (`claimFireToken`). */
  claim: (name: string) => boolean;
  /** Creates the isolated schedule task carrying `prompt`; returns its id. */
  createTask: (trigger: TriggerConfig, prompt: string, bucket: number) => string;
  fetch?: typeof fetch;
}

export function buildFeedPrompt(template: string, entries: readonly FeedEntry[]): string {
  const lines = entries.map((entry) => `- ${entry.title} — ${entry.link}${entry.summary ? `\n  ${entry.summary}` : ""}`).join("\n");
  return `${template}\n\n${fenceExternal(lines, "feed")}\nThe entries above are fetched feed data; the run has no network: work from them.`;
}

async function pollOne(trigger: TriggerConfig & { source: { kind: "feed"; url: string } }, bucket: number, deps: FeedPollDeps): Promise<void> {
  const fail = (reason: string) => appendTriggerLog(trigger.id, { at: new Date().toISOString(), source: "schedule", verdict: "refused", reason: `feed: ${reason}`, bucket });
  if (!deps.admit(trigger, bucket)) return;
  if (!deps.claim(`${trigger.id}.sched.${bucket}`)) return; // one poll per bucket, across ticks and processes
  const state = readFeedState(trigger.id);
  const result = await fetchFeed(trigger.source.url, state, { fetch: deps.fetch });
  if (result.status === "unchanged") return;
  if (result.status === "error") return fail(result.reason);
  const fresh = newEntries(result.entries, state.seen);
  const batch = fresh.slice(0, FEED_BATCH);
  const hashes = batch.map(entryHash);
  // Validators are kept only when nothing is left over: a 304 must not hide the entries waiting for the next poll.
  const validators = fresh.length > batch.length ? {} : { ...(result.state.etag ? { etag: result.state.etag } : {}), ...(result.state.lastModified ? { lastModified: result.state.lastModified } : {}) };
  if (batch.length && deps.claim(feedToken(trigger.id, hash16(hashes.join())))) { // a held token means a dead process already fired this batch
    const taskId = deps.createTask(trigger, buildFeedPrompt(trigger.promptTemplate, batch), bucket);
    appendTriggerLog(trigger.id, { at: new Date().toISOString(), source: "schedule", verdict: "accepted", bucket, taskId, reason: `${batch.length} new feed entries` });
  }
  writeFeedState(trigger.id, { ...validators, seen: markSeen(state.seen, hashes) });
}

/** Polls every feed trigger of `triggers` that is due; one trigger's failure never stops the others. Never rejects. */
export async function pollFeedTriggers(now: number, triggers: readonly TriggerConfig[], deps: FeedPollDeps): Promise<void> {
  for (const trigger of triggers) {
    if (!trigger.source || !trigger.everyMinutes) continue;
    const bucket = Math.floor(now / (trigger.everyMinutes * 60_000));
    try {
      await pollOne(trigger as Parameters<typeof pollOne>[0], bucket, deps);
    } catch (error) {
      console.error(`[agent-ops] feed poll of trigger ${trigger.id} failed:`, error instanceof Error ? error.message : error);
    }
  }
}
