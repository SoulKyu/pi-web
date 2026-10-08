import { isTaintSafeTool } from "../agents/untrusted-content";
import type { WrapperEvent } from "./prompt-run";

export interface RunUsage { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number; toolCalls: number; /** The run called a tool that is not in the local allowlist (web, MCP, code mode, bash, subagents…), nested calls included. */ externalTools: boolean; model?: string; provider?: string }
export const EMPTY_RUN_USAGE: RunUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0, toolCalls: 0, externalTools: false };
export interface UsageCollector { observe(event: WrapperEvent): void; snapshot(): RunUsage }

/** Counts only what this run's wrapper emits between the prompt and prompt_done: a user turn sharing the thread never lands here. */
export function createUsageCollector(): UsageCollector {
  const usage: RunUsage = { ...EMPTY_RUN_USAGE };
  return {
    observe(event) {
      if (event.type === "tool_execution_start") {
        if (!event.parentToolCallId) usage.toolCalls += 1;
        if (!isTaintSafeTool(event.toolName ?? "")) usage.externalTools = true;
      }
      if (event.type !== "message_end" || event.message?.role !== "assistant") return;
      const u = event.message.usage;
      usage.turns += 1;
      usage.input += u?.input ?? 0;
      usage.output += u?.output ?? 0;
      usage.cacheRead += u?.cacheRead ?? 0;
      usage.cacheWrite += u?.cacheWrite ?? 0;
      usage.cost += u?.cost?.total ?? 0;
      if (event.message.model) usage.model = event.message.model;
      if (event.message.provider) usage.provider = event.message.provider;
    },
    snapshot: () => ({ ...usage }),
  };
}
