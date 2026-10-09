import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import type { RunUsage } from "./run-usage";
import type { FireReason } from "./scheduler";

export type AgentTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export interface AgentTask {
  id: string; profile: string; cwd: string; title: string; prompt: string;
  origin: "ui" | "trigger" | "agent"; triggerId?: string;
  status: AgentTaskStatus; sessionId?: string; result?: string; error?: string;
  createdAt: string; startedAt?: string; completedAt?: string;
  /** Set by trigger ingestion; verified by start() before spawning. */
  pinnedProfileSha256?: string;
  /** Long-term agent the task belongs to; `target` says where it runs. Absent on legacy tasks. */
  agent?: string;
  target?: "thread" | "isolated";
  kind?: "schedule" | "task" | "webhook" | "review" | "reminder";
  /** Why a trigger fired this task (journal line of the same fire). */
  fireReason?: FireReason;
  /** Per-trigger run settings copied at creation: `provider/modelId`, tool subset of the trigger allowlist, duration cap in ms. */
  model?: string; tools?: string[]; maxRunMs?: number;
  /** ISO time before which no runner picks the task (deferred to the end of quiet hours); it does not count against the trigger cap while waiting. */
  notBefore?: string;
  /** Counted from the run's own wrapper events; the same numbers go to runs.jsonl. Absent when a cancel won the terminal write: runs.jsonl is the source of truth. */
  usage?: RunUsage;
  /** A retry is a new task: the finished task it repeats and its run number (1 when absent). */
  retryOf?: string; attempt?: number;
  /** Who asked: an agent name or "user". */
  requestedBy?: string;
  /** Agent whose thread receives the result as a display-only card (D14). */
  deliverTo?: string;
  /** The delegator's running thread task when `agent_delegate` created this one: cancelling the parent cancels it while queued. */
  parentTaskId?: string;
}
const RANK: Record<AgentTaskStatus, number> = { queued: 0, running: 1, completed: 2, failed: 2, cancelled: 2 };
export const TERMINAL: ReadonlySet<AgentTaskStatus> = new Set(["completed", "failed", "cancelled"]);

const storeDir = join(getAgentDir(), "agent-ops", "tasks");
const VALID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function isValidId(id: string): boolean { return VALID_ID.test(id); }
function taskPath(id: string): string { return join(storeDir, `${id}.json`); }
function lockPath(id: string): string { return join(storeDir, `${id}.lock`); }
function readOne(id: string): AgentTask | null {
  if (!isValidId(id)) return null;
  try {
    const raw = JSON.parse(readFileSync(taskPath(id), "utf8")) as AgentTask;
    return typeof raw?.id === "string" ? raw : null;
  } catch { return null; }
}
export function createTask(input: Pick<AgentTask, "profile" | "cwd" | "title" | "prompt" | "origin"> & Partial<Pick<AgentTask, "triggerId" | "pinnedProfileSha256" | "agent" | "target" | "kind" | "fireReason" | "model" | "tools" | "maxRunMs" | "notBefore" | "retryOf" | "attempt" | "requestedBy" | "deliverTo" | "parentTaskId">>): AgentTask {
  mkdirSync(storeDir, { recursive: true });
  const task: AgentTask = { id: randomUUID(), status: "queued", createdAt: new Date().toISOString(), ...input };
  writePrivateFileAtomicSync(taskPath(task.id), JSON.stringify(task, null, 2));
  return task;
}
export function getTask(id: string): AgentTask | null { if (!isValidId(id)) return null; return readOne(id); }
export function listTasks(): AgentTask[] {
  if (!existsSync(storeDir)) return [];
  return readdirSync(storeDir).filter((f) => f.endsWith(".json"))
    .map((f) => readOne(f.slice(0, -5))).filter((t): t is AgentTask => t !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function updateTask(id: string, patch: Partial<Omit<AgentTask, "id" | "createdAt">>): AgentTask {
  if (!isValidId(id)) throw new Error("invalid task id");
  const current = readOne(id);
  if (!current) throw new Error(`Unknown task: ${id}`);
  if (TERMINAL.has(current.status)) throw new Error(`Task ${id} is ${current.status}: terminal states are immutable`);
  if (patch.status && RANK[patch.status] < RANK[current.status]) throw new Error(`Task ${id}: cannot move ${current.status} back to ${patch.status}`);
  const next = { ...current, ...patch };
  writePrivateFileAtomicSync(taskPath(id), JSON.stringify(next, null, 2));
  return next;
}
/** Exclusive claim: the record stays at <id>.json; the lock is a separate wx file. */
export function claimTask(id: string): boolean {
  if (!isValidId(id)) return false;
  const task = readOne(id);
  if (!task || task.status !== "queued") return false;
  let fd: number;
  try { fd = openSync(lockPath(id), "wx"); } catch { return false; } // O_EXCL: one winner
  try { writeSync(fd, JSON.stringify({ pid: process.pid, claimedAt: new Date().toISOString() })); }
  finally { closeSync(fd); }
  const reread = readOne(id);
  if (!reread || reread.status !== "queued") {
    releaseClaim(id);
    return false;
  }
  try {
    updateTask(id, { status: "running", startedAt: new Date().toISOString() });
  } catch (err) {
    releaseClaim(id);
    throw err;
  }
  return true;
}
/** Records the run's session even after a racing cancel: sessionId is not a status, so the terminal guard does not apply. Never throws. */
export function attachSession(id: string, sessionId: string): void {
  if (!isValidId(id)) return;
  try {
    const current = readOne(id);
    if (current) writePrivateFileAtomicSync(taskPath(id), JSON.stringify({ ...current, sessionId }, null, 2));
  } catch { /* the task record is best effort here */ }
}
export function releaseClaim(id: string): void { if (!isValidId(id)) return; try { unlinkSync(lockPath(id)); } catch { /* gone */ } }
/** EPERM means the pid exists under another user: alive. Only ESRCH means dead. */
function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}
const FRESH_LOCK_MS = 5_000;
/** Startup recovery: a lock whose pid is dead means its owner will never finish. */
export function recoverInterrupted(): void {
  for (const task of listTasks()) {
    if (!existsSync(lockPath(task.id))) continue;
    let pid: number | undefined;
    try { pid = (JSON.parse(readFileSync(lockPath(task.id), "utf8")) as { pid?: number }).pid; } catch { pid = undefined; }
    if (pid !== undefined && isAlive(pid)) continue; // owner still running
    if (pid === undefined) {
      // Empty between `open wx` and `writeSync`: another process is mid-claim.
      try { if (Date.now() - statSync(lockPath(task.id)).mtimeMs < FRESH_LOCK_MS) continue; } catch { continue; }
    }
    if (task.status === "running") {
      updateTask(task.id, { status: "failed", error: "interrupted: owning process died", completedAt: new Date().toISOString() });
    }
    // queued + orphan lock (crash between the wx create and the running write): free the claim
    releaseClaim(task.id);
  }
}
/** Only queued tasks cancel; running ones go through the route's abort + update. */
export function cancelTask(id: string): boolean {
  if (!isValidId(id)) return false;
  const task = readOne(id);
  if (!task || task.status !== "queued") return false;
  updateTask(id, { status: "cancelled", completedAt: new Date().toISOString() });
  return true;
}
/** DELETE of an agent: cancels its queued tasks; running and terminal ones are left alone. */
export function cancelQueuedTasksOfAgent(name: string): number {
  return listTasks().filter((task) => task.agent === name && cancelTask(task.id)).length;
}
/** Cancelling a task cancels its queued children; running children are left alone. */
export function cancelQueuedChildren(parentId: string): number {
  return listTasks().filter((task) => task.parentTaskId === parentId && cancelTask(task.id)).length;
}
/** Retention: deletes terminal tasks completed more than maxAgeMs ago, plus a leftover lock. Never touches queued or running tasks. */
export function pruneTasks(maxAgeMs = 14 * 24 * 3_600_000): number {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;
  for (const task of listTasks()) {
    if (!TERMINAL.has(task.status) || !(Date.parse(task.completedAt ?? "") < cutoff)) continue;
    try { unlinkSync(taskPath(task.id)); pruned++; } catch { continue; }
    releaseClaim(task.id);
  }
  return pruned;
}
