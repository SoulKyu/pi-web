interface TimingEntry {
  type: string;
  timestamp: string;
  message?: { role?: string; toolCallId?: string; content?: unknown };
}

export interface ToolDuration { name: string; totalMs: number; calls: number }

/**
 * Estimate active wall-clock time from the append-only session log.
 *
 * Raw entries preserve compacted history and every executed branch exactly
 * once. Gaps ending at user messages are treated as human idle. User-initiated
 * bash entries are also boundaries because the log records only their finish
 * time, so counting the incoming gap could include arbitrary human idle.
 */
export function computeSessionTotalActiveMs(entries: readonly TimingEntry[]): number {
  let totalActiveMs = 0;
  let previousTimestamp: number | undefined;

  for (const entry of entries) {
    if (!isTimingEntry(entry.type)) continue;

    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp)) continue;

    const role = entry.type === "message" ? entry.message?.role : undefined;
    if (role === "user" || role === "bashExecution") {
      previousTimestamp = timestamp;
      continue;
    }

    if (previousTimestamp !== undefined && timestamp > previousTimestamp) {
      totalActiveMs += timestamp - previousTimestamp;
    }
    previousTimestamp = timestamp;
  }

  return totalActiveMs;
}

function isTimingEntry(type: string): boolean {
  return type === "message"
    || type === "compaction"
    || type === "branch_summary"
    || type === "custom_message";
}

/**
 * Time per tool: each toolResult's timestamp minus the timestamp of the assistant message holding its
 * toolCall. Parallel calls of one message all start at that message's timestamp (approximation).
 */
export function toolDurations(entries: readonly TimingEntry[]): ToolDuration[] {
  const started = new Map<string, { name: string; at: number }>();
  const byName = new Map<string, ToolDuration>();
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const at = Date.parse(entry.timestamp);
    if (!Number.isFinite(at)) continue;
    const { role, content, toolCallId } = entry.message;
    if (role === "assistant" && Array.isArray(content)) {
      for (const block of content as Array<{ type?: string; id?: string; name?: string }>) {
        if (block?.type === "toolCall" && block.id && block.name) started.set(block.id, { name: block.name, at });
      }
    } else if (role === "toolResult" && toolCallId) {
      const call = started.get(toolCallId);
      if (!call || at < call.at) continue;
      const total = byName.get(call.name) ?? { name: call.name, totalMs: 0, calls: 0 };
      total.totalMs += at - call.at;
      total.calls += 1;
      byName.set(call.name, total);
    }
  }
  return [...byName.values()].sort((a, b) => b.totalMs - a.totalMs);
}

export function topTools(durations: readonly ToolDuration[], n = 5): ToolDuration[] {
  return durations.slice(0, n);
}
