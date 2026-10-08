import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { abortRunningTasks } from "../agent-ops/kick";
import { mem0StagingDir } from "../agent-ops/memory-review";
import { readAgentOpsSettings, updateAgentOpsSettings } from "../agent-ops/settings";
import { listTasks, updateTask, type AgentTask } from "../agent-ops/task-store";
import { rotateSecret } from "../agent-ops/trigger-api";
import { listTriggers } from "../agent-ops/trigger-store";
import type { LongTermAgent } from "./registry";
import { archiveThreadLocked } from "./thread-archive";

export interface QuarantineDeps {
  pauseAgent: (name: string) => void;
  abortRunningTasks: (filter: (task: AgentTask) => boolean) => number;
  listTasks: () => AgentTask[];
  cancelTask: (id: string, completedAt: string) => void;
  archiveThread: (agent: LongTermAgent) => Promise<string | null>;
  stagingDir: () => string;
  listWebhookTriggers: (name: string) => string[];
  rotateSecret: (id: string) => { ok: true; trigger: { name: string }; webhookSecret: string } | { ok: false };
  now: () => Date;
}
export interface QuarantineResult {
  trash: string | null;
  secrets: { triggerId: string; name: string; webhookSecret: string }[];
  staged: number;
  tasksAborted: number;
  tasksCancelled: number;
  errors: string[];
}

const defaultDeps = (): QuarantineDeps => ({
  pauseAgent: (name) => {
    const { pausedAgents } = readAgentOpsSettings();
    if (!pausedAgents.includes(name)) updateAgentOpsSettings({ pausedAgents: [...pausedAgents, name] });
  },
  abortRunningTasks,
  listTasks,
  cancelTask: (id, completedAt) => { updateTask(id, { status: "cancelled", completedAt }); },
  archiveThread: async (agent) => {
    const archived = await archiveThreadLocked(agent, { force: true });
    return "trash" in archived ? archived.trash : null;
  },
  stagingDir: mem0StagingDir,
  listWebhookTriggers: (name) => listTriggers().filter((t) => t.profile === name && t.webhookSecretSha256).map((t) => t.id),
  rotateSecret: (id) => rotateSecret(id) as ReturnType<QuarantineDeps["rotateSecret"]>,
  now: () => new Date(),
});

const FACT_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;

/** Moves (never rewrites: pi-mem0 owns the layout) this agent's staged facts and their decisions aside. */
function moveStaged(dir: string, name: string, stamp: string): number {
  if (!existsSync(dir)) return 0;
  const target = join(dir, `quarantine-${stamp}`);
  let moved = 0;
  for (const file of readdirSync(dir)) {
    const id = FACT_FILE.exec(file)?.[1];
    if (!id) continue;
    try { if ((JSON.parse(readFileSync(join(dir, file), "utf8")) as { agent?: unknown }).agent !== name) continue; } catch { continue; }
    mkdirSync(target, { recursive: true, mode: 0o700 });
    chmodSync(target, 0o700);
    for (const f of [file, `${id}.decision.json`]) if (existsSync(join(dir, f))) renameSync(join(dir, f), join(target, f));
    moved += 1;
  }
  return moved;
}

/** Caller holds `withThreadLock(agent.name)`. The pause comes first and its failure throws; every later step
 *  is independent: a failure lands in `errors` and the others still run. Triggers stay enabled (the pause blocks runs). */
export async function quarantineAgent(agent: LongTermAgent, deps: QuarantineDeps = defaultDeps()): Promise<QuarantineResult> {
  const name = agent.name;
  deps.pauseAgent(name);
  const result: QuarantineResult = { trash: null, secrets: [], staged: 0, tasksAborted: 0, tasksCancelled: 0, errors: [] };
  const step = async (label: string, run: () => void | Promise<void>) => {
    try { await run(); } catch (error) { result.errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  await step("tasks", () => {
    result.tasksAborted = deps.abortRunningTasks((t) => t.agent === name);
    const completedAt = deps.now().toISOString();
    for (const task of deps.listTasks().filter((t) => t.agent === name && t.status === "queued")) {
      try { deps.cancelTask(task.id, completedAt); result.tasksCancelled += 1; } catch { /* started or finished meanwhile */ }
    }
  });
  await step("thread", async () => { result.trash = await deps.archiveThread(agent); });
  await step("staging", () => { result.staged = moveStaged(deps.stagingDir(), name, deps.now().toISOString().replace(/[:.]/g, "")); });
  await step("triggers", () => {
    for (const id of deps.listWebhookTriggers(name)) {
      try {
        const rotated = deps.rotateSecret(id);
        if (rotated.ok) result.secrets.push({ triggerId: id, name: rotated.trigger.name, webhookSecret: rotated.webhookSecret });
        else result.errors.push(`triggers: ${id} not rotated`);
      } catch (error) { result.errors.push(`triggers: ${id}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  });
  return result;
}
