import type { AgentDetailExtras } from "./agent-view";
import { memorySnapshotPath } from "./memory";
import type { LongTermAgent } from "./registry";

/** Server-only: the part of AgentDetail that needs the pi agent dir or the filesystem. */
export const agentDetailExtras = (agent: LongTermAgent): AgentDetailExtras => ({ memorySnapshotPath: memorySnapshotPath(agent.name) });
