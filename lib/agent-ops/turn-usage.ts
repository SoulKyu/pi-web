import type { WrapperEvent } from "./prompt-run";
import { priceRecord } from "../cost-equivalent";
import { appendRunRecord } from "./run-registry";
import { createUsageCollector, type UsageCollector } from "./run-usage";
import { listTasks } from "./task-store";

export interface TurnUsageSource {
  /** The agent profile of the open session, when it is a trusted thread. */
  trustedAgent(): string | undefined;
  hasPendingPrompt(): boolean;
  sessionId(): string;
}

const threadTaskRunning = (agent: string): boolean =>
  listTasks().some((t) => t.status === "running" && t.target === "thread" && t.agent === agent);

/** One runs.jsonl record per user turn of a trusted thread. A turn the runner owns (a thread task was running at
 *  agent_start or still is at agent_end, e.g. a cancel wrote its status before the abort) is the runner's to record. */
export function createTurnUsageTracker(source: TurnUsageSource): (event: WrapperEvent) => void {
  let turn: { agent: string; collector: UsageCollector; runnerTurn: boolean; lastStopReason?: string } | null = null;
  return (event) => {
    if (event.type === "agent_start" && source.hasPendingPrompt()) {
      const agent = source.trustedAgent();
      turn = agent ? { agent, collector: createUsageCollector(), runnerTurn: threadTaskRunning(agent) } : null;
    }
    if (!turn) return;
    turn.collector.observe(event);
    if (event.type === "message_end" && event.message?.role === "assistant") turn.lastStopReason = event.message.stopReason;
    if (event.type !== "agent_end") return;
    const done = turn;
    turn = null;
    if (done.runnerTurn || threadTaskRunning(done.agent)) return;
    const usage = done.collector.snapshot();
    appendRunRecord({
      ts: new Date().toISOString(), agent: done.agent, origin: "user", sessionId: source.sessionId(),
      status: done.lastStopReason === "error" ? "failed" : "completed", ...priceRecord(usage), usage,
    });
  };
}
