import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";

export type StagedDecision = "approved" | "rejected" | "applying" | null;
export interface StagedFactView {
  id: string; agent: string; text: string; sourceSession: string; createdAt: string;
  decision: StagedDecision;
}
export class MemoryReviewError extends Error {
  constructor(readonly code: "not_found" | "conflict", message: string) { super(message); }
}

// Layout owned by pi-mem0 (src/staging.ts): pi-web only lists facts and writes decisions, never the store.
const FACT_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;
const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A `.processing` this old was left by a crashed apply: pi-mem0's README says to re-approve it from pi-web,
 *  and its next pass renames the new decision over it. */
const STALE_PROCESSING_MS = 10 * 60_000;

export function mem0StagingDir(): string {
  return join(process.env.PI_MEM0_DIR ?? join(getAgentDir(), "mem0"), "staging");
}

function readFact(dir: string, id: string): Omit<StagedFactView, "decision"> | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as Record<string, unknown>;
    const { agent, text, sourceSession, createdAt } = raw;
    if (raw.id !== id || [agent, text, sourceSession, createdAt].some((v) => typeof v !== "string")) return null;
    return { id, agent: agent as string, text: text as string, sourceSession: sourceSession as string, createdAt: createdAt as string };
  } catch {
    return null;
  }
}

/** "fresh" while an apply may still be running, "stale" when it was abandoned, "none" without a claim file. */
function processingState(dir: string, id: string): "none" | "fresh" | "stale" {
  try {
    return Date.now() - statSync(join(dir, `${id}.processing`)).mtimeMs > STALE_PROCESSING_MS ? "stale" : "fresh";
  } catch {
    return "none";
  }
}

function readDecision(dir: string, id: string): StagedDecision {
  if (processingState(dir, id) === "fresh") return "applying";
  try {
    const { approved } = JSON.parse(readFileSync(join(dir, `${id}.decision.json`), "utf8")) as { approved?: unknown };
    return typeof approved === "boolean" ? (approved ? "approved" : "rejected") : null;
  } catch {
    return null;
  }
}

export function listStagedFacts(dir = mem0StagingDir()): StagedFactView[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const facts: StagedFactView[] = [];
  for (const name of names) {
    const id = FACT_FILE.exec(name)?.[1];
    const fact = id ? readFact(dir, id) : null;
    if (fact) facts.push({ ...fact, decision: readDecision(dir, fact.id) });
  }
  return facts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function writeDecision(id: string, approved: boolean, dir = mem0StagingDir()): void {
  if (!VALID_ID.test(id) || !readFact(dir, id)) throw new MemoryReviewError("not_found", "Staged memory not found");
  if (processingState(dir, id) === "fresh") throw new MemoryReviewError("conflict", "Memory is being applied");
  writePrivateFileAtomicSync(join(dir, `${id}.decision.json`), JSON.stringify({ approved }));
}
