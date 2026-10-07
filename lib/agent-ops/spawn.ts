import { randomUUID } from "node:crypto";
import { getLongTermAgent, resolveLongTermProfile } from "../agents/registry";
import { syncAgentMcpOverrides } from "../agents/mcp-access";
import { startRpcSession } from "../rpc-manager";
import { invalidateSessionListCache } from "../session-reader";
import { enforceTriggerTools, watchPromptRun } from "./prompt-run";
import type { RunHandle } from "./runner";
import { splitModel } from "../agents/agent-view";
import type { AgentTask } from "./task-store";
import { profilePinSha256, TRIGGER_TOOL_ALLOWLIST, triggerRunPin } from "./trigger-store";

type SpawnTask = Pick<AgentTask, "profile" | "cwd" | "prompt" | "origin" | "pinnedProfileSha256" | "model" | "tools">;

/** `deps.startRpcSession` is a seam for tests. */
export async function startAgentProfileRun(
  task: SpawnTask, beforePrompt?: () => void, deps: { startRpcSession: typeof startRpcSession } = { startRpcSession },
): Promise<RunHandle> {
  const { profile, cwd, prompt } = task;
  const pin = triggerRunPin(task); // fail closed: a trigger task without its pin throws
  if (pin !== undefined) {
    // Pin check before anything: re-resolve the global profile and compare.
    const resolved = resolveLongTermProfile(task.profile);
    if (!resolved) throw new Error(`trigger profile not found or disabled: ${profile}`);
    const actual = profilePinSha256(resolved);
    if (actual !== pin) {
      throw new Error(`trigger profile drift: pinned ${pin.slice(0, 12)}, found ${actual.slice(0, 12)}`);
    }
  }
  // An isolated run of a long-term agent runs in its home: regenerate its MCP blocklist before the adapter reads it.
  const agent = getLongTermAgent(profile);
  if (agent && agent.home === cwd) syncAgentMcpOverrides(agent.home, agent.mcpServers);
  const initialModel = task.model ? splitModel(task.model) : null;
  const tempKey = `__agentops__${randomUUID()}`; // unique: same-key callers coalesce onto one session
  const { session, realSessionId } = await deps.startRpcSession(tempKey, "", cwd, {
    agentProfile: profile, // trust stays absent: the run is untrusted and narrowed to the allowlist
    ...(pin !== undefined ? { agentProfileTools: (task.tools ?? [...TRIGGER_TOOL_ALLOWLIST]).filter((t) => TRIGGER_TOOL_ALLOWLIST.has(t)) } : {}),
    ...(initialModel ? { initialModel } : {}),
  });
  invalidateSessionListCache(); // the route's call at queue time ran before this session existed
  if (pin !== undefined) await enforceTriggerTools(session, task.tools);
  try { beforePrompt?.(); } catch (error) { await session.shutdown().catch(() => {}); throw error; }
  const run = watchPromptRun(session, prompt);
  return { sessionId: realSessionId, done: run.done, abort: run.abort, usage: run.usage };
}
