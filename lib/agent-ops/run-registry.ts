import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { recordRunMetrics } from "./metrics";
import type { RunUsage } from "./run-usage";

export interface RunRecord {
  ts: string; agent?: string; origin: "ui" | "trigger" | "user" | "agent"; kind?: string; target?: string;
  triggerId?: string; taskId?: string; sessionId?: string;
  status: "completed" | "failed" | "cancelled"; durationMs?: number;
  usage: RunUsage; billing: "api" | "subscription" | "unknown"; costEquivalent?: number;
}

export const runsPath = (agentDir = getAgentDir()): string => join(agentDir, "agent-ops", "runs.jsonl");
const ROTATE_BYTES = 10 * 1024 * 1024;

/** One line per finished run. Survives task retention (14 days) and thread resets: the FinOps source of truth. */
export function appendRunRecord(record: RunRecord, path = runsPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    recordRunMetrics(record);
  } catch (error) {
    console.error("[agent-ops] run record:", error instanceof Error ? error.message : error);
  }
}

export function readRunRecords({ since, agent, path = runsPath() }: { since?: string; agent?: string; path?: string } = {}): RunRecord[] {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  const records: RunRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const record = JSON.parse(line) as RunRecord;
      if (typeof record.ts !== "string" || !record.usage) continue;
      if (since && record.ts < since) continue;
      if (agent && record.agent !== agent) continue;
      records.push(record);
    } catch { /* a torn line is skipped */ }
  }
  return records;
}

export function rotateRunRecords(maxBytes = ROTATE_BYTES, path = runsPath()): void {
  try {
    if (existsSync(path) && statSync(path).size > maxBytes) {
      renameSync(path, path.replace(/\.jsonl$/, `.${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`));
    }
  } catch { /* next hour */ }
}
