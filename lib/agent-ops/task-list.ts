import { billingOf, createEquivalentCostResolver } from "../cost-equivalent";
import type { AgentTask } from "./task-store";

/** What the panel receives: no prompt (the title is its first line) and a bounded result/error (the session holds the full text). */
/** `costEquivalent` is priced on the server (subscription providers only), so the client stays free of pricing. */
export type AgentTaskListItem = Omit<AgentTask, "prompt"> & { costEquivalent?: number };

export const TASK_LIST_RECENT_LIMIT = 200;
export const TASK_LIST_TEXT_MAX = 2000;

const clip = (text: string | undefined): string | undefined =>
  text !== undefined && text.length > TASK_LIST_TEXT_MAX ? `${text.slice(0, TASK_LIST_TEXT_MAX)}…` : text;

/** Every queued/running task plus the newest `recentLimit` others, newest first. `truncated` is set only when older tasks were cut. */
export function shapeTaskList(tasks: readonly AgentTask[], recentLimit = TASK_LIST_RECENT_LIMIT): { tasks: AgentTaskListItem[]; truncated?: true } {
  const newestFirst = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isActive = (task: AgentTask) => task.status === "queued" || task.status === "running";
  let others = 0;
  const kept = newestFirst.filter((task) => isActive(task) || others++ < recentLimit);
  const equivalentOf = createEquivalentCostResolver(); // one models.json read per provider/model pair per call
  const items = kept.map((task): AgentTaskListItem => {
    const item: Partial<AgentTask> = { ...task, result: clip(task.result), error: clip(task.error) };
    delete item.prompt;
    if (item.result === undefined) delete item.result;
    if (item.error === undefined) delete item.error;
    const { usage } = task;
    const costEquivalent = usage?.provider && usage.model && billingOf(usage.provider) === "subscription" ? equivalentOf(usage.provider, usage.model, usage) : 0;
    return (costEquivalent > 0 ? { ...item, costEquivalent } : item) as AgentTaskListItem;
  });
  return kept.length < tasks.length ? { tasks: items, truncated: true } : { tasks: items };
}
