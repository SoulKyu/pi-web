import { appendTriggerLog, type TriggerLogEntry } from "./trigger-log";
import { budgetRefusalFor } from "./scheduler";
import { listTasks, updateTask, type AgentTask } from "./task-store";

/** Reason a trigger-origin task must not start: its agent's daily budget is reached. UI-queued tasks are never gated. */
export function triggerBudgetRefusal(task: Pick<AgentTask, "origin" | "agent" | "profile">, refusalFor: (agent: string) => string | null = (agent) => budgetRefusalFor(agent)): string | null {
  return task.origin === "trigger" ? refusalFor(task.agent ?? task.profile) : null;
}

/** Pure: the queued trigger tasks whose agent is over budget, with the reason. `refusalFor` is asked once per agent. */
export function overBudgetTriggerTasks(queued: readonly AgentTask[], refusalFor: (agent: string) => string | null): Array<{ task: AgentTask; reason: string }> {
  const asked = new Map<string, string | null>();
  const refusal = (agent: string): string | null => {
    if (!asked.has(agent)) asked.set(agent, refusalFor(agent));
    return asked.get(agent)!;
  };
  const over: Array<{ task: AgentTask; reason: string }> = [];
  for (const task of queued) {
    const reason = task.status === "queued" ? triggerBudgetRefusal(task, refusal) : null;
    if (reason) over.push({ task, reason });
  }
  return over;
}

/** Before each runner pass: a queued trigger task over budget (admitted earlier, e.g. deferred overnight) fails with the budget reason
 *  and one journal line, so nothing stays queued to fire after the budget is reached. A task a cancel won the race for is skipped. */
export function failOverBudgetTriggerTasks(deps: { list: () => AgentTask[]; refusalFor: (agent: string) => string | null; fail: typeof updateTask; log: typeof appendTriggerLog } = { list: listTasks, refusalFor: (agent) => budgetRefusalFor(agent), fail: updateTask, log: appendTriggerLog }): number {
  let failed = 0;
  for (const { task, reason } of overBudgetTriggerTasks(deps.list().filter((t) => t.status === "queued"), deps.refusalFor)) {
    const at = new Date().toISOString();
    try { deps.fail(task.id, { status: "failed", error: reason, completedAt: at }); } catch { continue; }
    failed += 1;
    if (task.triggerId) deps.log(task.triggerId, { at, source: (task.fireReason?.source ?? "schedule") as TriggerLogEntry["source"], verdict: "refused", reason, ...(task.fireReason?.bucket !== undefined ? { bucket: task.fireReason.bucket } : {}), ...(task.fireReason?.payloadHash ? { payloadHash: task.fireReason.payloadHash } : {}) });
  }
  return failed;
}
