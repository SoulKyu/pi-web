import { randomUUID } from "node:crypto";
import { resolveSubagentProfile } from "../subagents";
import { startRpcSession } from "../rpc-manager";
import { invalidateSessionListCache } from "../session-reader";
import { enforceTriggerTools, watchPromptRun } from "./prompt-run";
import type { RunHandle } from "./runner";
import { profilePinSha256 } from "./trigger-store";

export async function startAgentProfileRun(
  profile: string, cwd: string, prompt: string, expectedPinSha256?: string,
): Promise<RunHandle> {
  const isTriggerRun = expectedPinSha256 !== undefined;
  if (isTriggerRun) {
    // Pin check before anything: re-resolve and compare.
    const resolved = resolveSubagentProfile(cwd, profile);
    if (!resolved) throw new Error(`trigger profile not found or disabled: ${profile}`);
    const actual = profilePinSha256(resolved);
    if (actual !== expectedPinSha256) {
      throw new Error(`trigger profile drift: pinned ${expectedPinSha256.slice(0, 12)}, found ${actual.slice(0, 12)}`);
    }
  }
  const tempKey = `__agentops__${randomUUID()}`; // unique: same-key callers coalesce onto one session
  const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, { agentProfile: profile });
  invalidateSessionListCache(); // the route's call at queue time ran before this session existed
  if (isTriggerRun) await enforceTriggerTools(session);
  const { done, abort } = watchPromptRun(session, prompt);
  return { sessionId: realSessionId, done, abort };
}
