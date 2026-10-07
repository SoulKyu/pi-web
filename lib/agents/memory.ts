import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { AGENT_NAME_RE } from "./registry";

export interface AgentMemoryItem { id: string; text: string; createdAt: string; source: string }
/** One line of pi-mem0's journal (src/journal.ts), mirrored in the agent snapshot as `events`. */
export interface JournalEvent { at: string; kind: "add" | "forget"; id: string; text: string; source: string; scope: string; sessionId?: string }
export class MemoryNotFoundError extends Error {}
const MEMORY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(json|processing)$/;
const SNAPSHOT_LIMIT = 200;
const JOURNAL_LIMIT = 100;
const SNAPSHOT_MAX_BYTES = 1024 * 1024;

// Layout owned by pi-mem0 (src/snapshot.ts): pi-web reads snapshots and writes requests, never the store.
export function mem0Dir(): string { return process.env.PI_MEM0_DIR ?? join(getAgentDir(), "mem0"); }

export interface Mem0Health { watcherAt?: string; lastRecallAt?: string; lastRecallMs?: number; lastCaptureAt?: string; lastCaptureError?: string }
const HEALTH_STRINGS = ["watcherAt", "lastRecallAt", "lastCaptureAt", "lastCaptureError"] as const;

/** pi-mem0's heartbeat (src/health.ts): undefined when absent or unreadable. */
export function readMem0Health(dir = mem0Dir()): Mem0Health | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(dir, "health.json"), "utf8")) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const health: Mem0Health = {};
    for (const key of HEALTH_STRINGS) if (typeof raw[key] === "string") health[key] = raw[key];
    if (typeof raw.lastRecallMs === "number") health.lastRecallMs = raw.lastRecallMs;
    return health;
  } catch { return undefined; }
}

export function readAgentMemorySnapshot(name: string, dir = mem0Dir()): AgentMemoryItem[] {
  if (!AGENT_NAME_RE.test(name)) return [];
  try {
    const file = join(dir, "agents", `${name}.json`);
    if (statSync(file).size > SNAPSHOT_MAX_BYTES) return [];
    const raw = JSON.parse(readFileSync(file, "utf8")) as { agent?: unknown; memories?: unknown };
    if (raw.agent !== name || !Array.isArray(raw.memories)) return [];
    return raw.memories.flatMap((item) => {
      const { id, text, createdAt, source } = (item ?? {}) as Record<string, unknown>;
      return typeof id === "string" && typeof text === "string" && typeof createdAt === "string" && typeof source === "string"
        ? [{ id, text, createdAt, source }] : [];
    }).slice(0, SNAPSHOT_LIMIT);
  } catch { return []; }
}

export function readAgentMemoryEvents(name: string, dir = mem0Dir()): JournalEvent[] {
  if (!AGENT_NAME_RE.test(name)) return [];
  try {
    const file = join(dir, "agents", `${name}.json`);
    if (statSync(file).size > SNAPSHOT_MAX_BYTES) return [];
    const raw = JSON.parse(readFileSync(file, "utf8")) as { agent?: unknown; events?: unknown };
    if (raw.agent !== name || !Array.isArray(raw.events)) return [];
    return raw.events.flatMap((item): JournalEvent[] => {
      const { at, kind, id, text, source, scope, sessionId } = (item ?? {}) as Record<string, unknown>;
      return typeof at === "string" && (kind === "add" || kind === "forget") && typeof id === "string" && typeof text === "string"
        && typeof source === "string" && typeof scope === "string" && (sessionId === undefined || typeof sessionId === "string")
        ? [{ at, kind, id, text, source, scope, ...(sessionId === undefined ? {} : { sessionId }) }] : [];
    }).slice(0, JOURNAL_LIMIT);
  } catch { return []; }
}

export function listPendingForgets(name: string, dir = mem0Dir()): string[] {
  let names: string[];
  try { names = readdirSync(join(dir, "forget")); } catch { return []; }
  return names.filter((file) => REQUEST_FILE.test(file)).flatMap((file) => {
    try {
      const raw = JSON.parse(readFileSync(join(dir, "forget", file), "utf8")) as { memoryId?: unknown; agent?: unknown };
      return raw.agent === name && typeof raw.memoryId === "string" ? [raw.memoryId] : [];
    } catch { return []; }
  });
}

/** pi-mem0's 30 s watcher applies it, refusing a memory outside the agent's scope, then refreshes the snapshot. */
export function requestForget(name: string, memoryId: string, dir = mem0Dir()): string {
  if (!AGENT_NAME_RE.test(name)) throw new Error("invalid agent name");
  if (!MEMORY_ID_RE.test(memoryId)) throw new Error("invalid memory id");
  if (!readAgentMemorySnapshot(name, dir).some((item) => item.id === memoryId)) throw new MemoryNotFoundError("memory not found");
  mkdirSync(join(dir, "forget"), { recursive: true, mode: 0o700 });
  const id = randomUUID();
  writePrivateFileAtomicSync(join(dir, "forget", `${id}.json`), JSON.stringify({ memoryId, agent: name }));
  return id;
}
