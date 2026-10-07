import { getLongTermAgent } from "../agents/registry";
import { webhookEventOfTask } from "../agents/events";
import { appendThreadEvent } from "../agents/thread";
import { selectIsolatedTasks, selectThreadTasks } from "../agents/queue";
import { startThreadEventRun } from "../agents/thread-run";
import { getRpcSession, isRpcSessionStarting } from "../rpc-manager";
import { redactSecrets } from "./redact";
import { automaticCapacity, memAvailableMb } from "./capacity";
import { runningCount, runPendingTasks } from "./runner";
import { startAgentProfileRun } from "./spawn";
import { pushBudgetReachedOnce } from "./budget-push";
import { assertTaskStillStartable } from "./start-guard";
import { readAgentOpsSettings, isPausedFor } from "./settings";
import { listTasks, recoverInterrupted, updateTask, type AgentTask } from "./task-store";
import { priceRecord } from "../cost-equivalent";
import { localeText, notifyAgent } from "../web-push";

declare global { var __agentOpsRecovered: boolean | undefined; }

const log = (error: unknown) => console.error("[agent-ops] runner failed:", error instanceof Error ? error.message : error);

/** Once per process, on first access of the task routes: fail the runs a dead process left behind, then drain the queue. */
export function recoverOnce(): void {
  if (globalThis.__agentOpsRecovered) return;
  globalThis.__agentOpsRecovered = true;
  try { recoverInterrupted(); } catch (error) { console.error("[agent-ops] recovery failed:", error instanceof Error ? error.message : error); }
  void kickRunner();
}

function isThreadBusy(agentName: string): boolean {
  const sessionId = getLongTermAgent(agentName)?.threadSessionId;
  if (!sessionId) return false;
  if (isRpcSessionStarting(sessionId)) return true;
  const live = getRpcSession(sessionId);
  return Boolean(live?.isAlive() && live.isRunning());
}

/** After a terminal write: a failed run of a long-term agent pushes; a finished isolated run posts its summary card. Neither blocks nor throws. */
export function handleTaskEnd(task: AgentTask): void {
  if (!task.agent) return;
  const agentName = task.agent;
  if (task.status === "failed") {
    notifyAgent((locale) => ({
      title: agentName,
      body: localeText(locale, "agentRunFailed").replace("{name}", agentName).replace("{title}", task.title),
      url: `/?agent=${encodeURIComponent(agentName)}`,
      tag: `pi-agent-failed:${task.id}`,
    })).catch((error) => console.error("[agent-ops] failure push:", error instanceof Error ? error.message : error));
  }
  void pushBudgetReachedOnce(agentName); // a run that reaches the daily budget: one push per agent per day
  if (task.target === "isolated") {
    const agent = getLongTermAgent(agentName);
    const event = webhookEventOfTask({ ...task, ...(task.usage ? { costEquivalent: priceRecord(task.usage).costEquivalent } : {}), result: task.result && redactSecrets(task.result), error: task.error && redactSecrets(task.error) });
    if (agent && event) void appendThreadEvent(agent, event).catch((error) => console.error("[agent-ops] summary card:", error instanceof Error ? error.message : error));
  }
}

/** Pause: running tasks of the scope are aborted (cancelled), queued ones wait. */
export function abortRunningTasks(filter: (task: AgentTask) => boolean): number {
  let count = 0;
  for (const task of listTasks().filter((t) => t.status === "running" && filter(t))) {
    try { updateTask(task.id, { status: "cancelled", completedAt: new Date().toISOString() }); } catch { continue; }
    if (task.sessionId) void getRpcSession(task.sessionId)?.send({ type: "abort" }).catch(() => {});
    count += 1;
  }
  return count;
}

/** Single runner entry point: the task route, the webhook and the scheduler all call it.
 *  A finished run re-kicks, so a freed slot never idles until the next external kick.
 *  Isolated runs keep the 2 slots; thread events run one per agent; one cap and a free-memory floor bound both. Settings are read once per kick. */
export function kickRunner(): Promise<void> {
  const settings = readAgentOpsSettings();
  const pausedNow = (agent?: string) => isPausedFor(settings, agent);
  const capacity = () => automaticCapacity({
    maxAutomaticRuns: settings.maxAutomaticRuns, minFreeMb: settings.minFreeMb,
    running: runningCount("__agentOpsRunning") + runningCount("__agentOpsThreadRunning"), freeMb: memAvailableMb(),
  });
  const isolated = runPendingTasks({
    maxConcurrent: 2, capacity, slotKey: "__agentOpsRunning", select: (queued) => selectIsolatedTasks(queued, pausedNow),
    start: (task) => startAgentProfileRun(task, () => assertTaskStillStartable(task)),
    onRunEnd: () => void kickRunner(), onTaskEnd: handleTaskEnd,
  });
  const thread = runPendingTasks({
    maxConcurrent: Number.POSITIVE_INFINITY, capacity, slotKey: "__agentOpsThreadRunning",
    select: (queued, all) => selectThreadTasks(queued, all, isThreadBusy, pausedNow),
    start: startThreadEventRun, onRunEnd: () => void kickRunner(), onTaskEnd: handleTaskEnd,
  });
  return Promise.all([isolated, thread]).then(() => undefined, log);
}
