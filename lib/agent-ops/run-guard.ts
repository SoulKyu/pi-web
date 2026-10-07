import type { WrapperEvent } from "./prompt-run";

export class RunGuardError extends Error {
  constructor(readonly rule: "identical-calls" | "tool-calls" | "turns", message: string) {
    super(message);
    this.name = "RunGuardError";
  }
}

export interface RunGuardLimits { maxIdenticalCalls: number; maxToolCalls: number; maxTurns: number }

export const DEFAULT_RUN_GUARD_LIMITS: RunGuardLimits = { maxIdenticalCalls: 5, maxToolCalls: 150, maxTurns: 60 };

/** Watches one run's events for a tool loop or a runaway. Only top-level calls count: nested ones
 *  (parentToolCallId set) belong to their parent call. */
export function createRunGuard(limits: RunGuardLimits = DEFAULT_RUN_GUARD_LIMITS): { observe(event: WrapperEvent): RunGuardError | undefined } {
  let toolCalls = 0;
  let turns = 0;
  let streakKey = "";
  let streak = 0;
  return {
    observe(event) {
      if (event.type === "message_end" && event.message?.role === "assistant") {
        if (++turns >= limits.maxTurns) return new RunGuardError("turns", `too many turns: ${turns}`);
      } else if (event.type === "tool_execution_start" && !event.parentToolCallId) {
        const key = `${event.toolName}\u0000${JSON.stringify(event.args)}`;
        streak = key === streakKey ? streak + 1 : 1;
        streakKey = key;
        if (streak >= limits.maxIdenticalCalls) return new RunGuardError("identical-calls", `loop detected: ${event.toolName} × ${streak}`);
        if (++toolCalls >= limits.maxToolCalls) return new RunGuardError("tool-calls", `too many tool calls: ${toolCalls}`);
      }
      return undefined;
    },
  };
}
