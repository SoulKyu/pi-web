import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { triggersDir } from "./trigger-store";

export interface TriggerLogEntry {
  at: string;
  source: "schedule" | "webhook" | "manual";
  verdict: "accepted" | "refused";
  reason?: string;
  bucket?: number;
  payloadHash?: string;
  taskId?: string;
}

const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRIM_ABOVE = 600;
const KEEP = 500;

/** `<uuid>.log.jsonl` next to `<uuid>.json`: listTriggers only reads `*.json`, the token purge only matches token names. */
export const triggerLogPath = (triggerId: string): string => join(triggersDir(), `${triggerId}.log.jsonl`);

const linesOf = (text: string): string[] => text.split("\n").filter(Boolean);

/** Never throws: a journal failure must not stop a fire. */
export function appendTriggerLog(triggerId: string, entry: TriggerLogEntry): void {
  if (!VALID_ID.test(triggerId)) return;
  try {
    mkdirSync(triggersDir(), { recursive: true, mode: 0o700 });
    const path = triggerLogPath(triggerId);
    appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    // ponytail: re-reads the file on every append; fine for a <=600-line journal.
    const lines = linesOf(readFileSync(path, "utf8"));
    if (lines.length > TRIM_ABOVE) writePrivateFileAtomicSync(path, `${lines.slice(-KEEP).join("\n")}\n`);
  } catch (error) {
    console.error(`[agent-ops] trigger journal write failed for ${triggerId}:`, error instanceof Error ? error.message : error);
  }
}

/** Newest first; junk lines are skipped; never more than the 500 kept lines. */
export function readTriggerLog(triggerId: string, limit = 100): TriggerLogEntry[] {
  if (!VALID_ID.test(triggerId)) return [];
  let text: string;
  try { text = readFileSync(triggerLogPath(triggerId), "utf8"); } catch { return []; }
  const entries: TriggerLogEntry[] = [];
  const lines = linesOf(text);
  for (let i = lines.length - 1; i >= 0 && entries.length < Math.min(limit, KEEP); i--) {
    try {
      const entry = JSON.parse(lines[i]) as TriggerLogEntry;
      if (entry && typeof entry.at === "string" && (entry.verdict === "accepted" || entry.verdict === "refused")) entries.push(entry);
    } catch { /* junk line */ }
  }
  return entries;
}
