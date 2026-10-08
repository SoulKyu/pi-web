import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { AgentDetailExtras } from "./agent-view";
import { bwrapAvailable } from "./sandbox";
import { memorySnapshotPath } from "./memory";
import type { LongTermAgent } from "./registry";

/** Server-only: the part of AgentDetail that needs the pi agent dir or the filesystem. */
export function agentDetailExtras(agent: LongTermAgent): AgentDetailExtras {
  const extras: AgentDetailExtras = { memorySnapshotPath: memorySnapshotPath(agent.name), sandboxAvailable: bwrapAvailable() !== null };
  try {
    const stat = lstatSync(join(agent.home, "MEMORY.md")); // the home is agent-writable: a symlink is not a file to show
    if (stat.isFile()) extras.memoryMd = { size: stat.size };
  } catch { /* no MEMORY.md */ }
  return extras;
}
