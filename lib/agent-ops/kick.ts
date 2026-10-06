import { getLongTermAgent } from "../agents/registry";
import { webhookEventOfTask } from "../agents/events";
import { appendThreadEvent } from "../agents/thread";
import { selectIsolatedTasks, selectThreadTasks } from "../agents/queue";
import { startThreadEventRun } from "../agents/thread-run";
import { getRpcSession, isRpcSessionStarting } from "../rpc-manager";
import { redactSecrets } from "./redact";
import { runPendingTasks } from "./runner";
import { startAgentProfileRun } from "./spawn";
import { recoverInterrupted, type AgentTask } from "./task-store";
import { triggerRunPin } from "./trigger-store";
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

/** After a terminal write: a failed run of a long-term agent pushes; a finished webhook run posts its summary card. Neither blocks nor throws. */
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
  if (task.target === "isolated" && task.kind === "webhook") {
    const agent = getLongTermAgent(agentName);
    const event = webhookEventOfTask({ ...task, result: task.result && redactSecrets(task.result), error: task.error && redactSecrets(task.error) });
    if (agent && event) void appendThreadEvent(agent, event).catch((error) => console.error("[agent-ops] summary card:", error instanceof Error ? error.message : error));
  }
}

/** Single runner entry point: the task route, the webhook and the scheduler all call it.
 *  A finished run re-kicks, so a freed slot never idles until the next external kick.
 *  Isolated runs keep the 2 slots; thread events run one per agent. */
export function kickRunner(): Promise<void> {
  const isolated = runPendingTasks({
    maxConcurrent: 2, slotKey: "__agentOpsRunning", select: selectIsolatedTasks,
    start: (task) => startAgentProfileRun(task.profile, task.cwd, task.prompt, triggerRunPin(task)),
    onRunEnd: () => void kickRunner(), onTaskEnd: handleTaskEnd,
  });
  const thread = runPendingTasks({
    maxConcurrent: Number.POSITIVE_INFINITY, slotKey: "__agentOpsThreadRunning",
    select: (queued, all) => selectThreadTasks(queued, all, isThreadBusy),
    start: startThreadEventRun, onRunEnd: () => void kickRunner(), onTaskEnd: handleTaskEnd,
  });
  return Promise.all([isolated, thread]).then(() => undefined, log);
}
