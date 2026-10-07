import { notifyAgent, localeText, type PushPayload } from "../web-push";
import { getRpcSession } from "../rpc-manager";
import { listLongTermAgents, type LongTermAgent } from "./registry";

interface WrapperProbe { hasPendingUiRequests(): boolean; pendingUiSince(): number | undefined; subscriberCount(): number }
export interface NeedsInputDeps {
  agents: () => Pick<LongTermAgent, "name" | "threadSessionId">[];
  wrapperOf: (sessionId: string) => WrapperProbe | undefined;
  push: (payloadFor: (locale: string) => PushPayload) => Promise<void>;
  now: () => number;
  intervalMs?: number;
}
const GRACE_MS = 60_000;
declare global { var __needsInputPushStop: (() => void) | undefined }

/** One push per (agent, request start) when a trusted thread waits for the user for over a minute with no tab watching. Returns the stop function. */
export function startNeedsInputPush(deps: NeedsInputDeps = {
  agents: listLongTermAgents,
  wrapperOf: (sessionId) => { const live = getRpcSession(sessionId); return live?.isAlive() ? live : undefined; },
  push: notifyAgent,
  now: Date.now,
}): () => void {
  if (globalThis.__needsInputPushStop) return globalThis.__needsInputPushStop; // one interval per process, even if register() runs twice
  const sent = new Set<string>();
  const tick = () => {
    const live = new Set<string>();
    try {
      for (const agent of deps.agents()) {
        const wrapper = agent.threadSessionId ? deps.wrapperOf(agent.threadSessionId) : undefined;
        const since = wrapper?.hasPendingUiRequests() ? wrapper.pendingUiSince() : undefined;
        if (!wrapper || since === undefined) continue;
        const key = `${agent.name}:${since}`;
        live.add(key);
        if (sent.has(key) || since > deps.now() - GRACE_MS || wrapper.subscriberCount() > 0) continue;
        sent.add(key);
        deps.push((locale) => ({
          title: agent.name,
          body: localeText(locale, "agentNeedsInput").replace("{name}", agent.name),
          url: `/?agent=${encodeURIComponent(agent.name)}`,
          tag: `pi-agent-input:${key}`,
        })).catch((error) => console.error("[agents] needs-input push:", error instanceof Error ? error.message : error));
      }
    } catch (error) {
      console.error("[agents] needs-input check:", error instanceof Error ? error.message : error);
    }
    for (const key of sent) if (!live.has(key)) sent.delete(key);
  };
  const timer = setInterval(tick, deps.intervalMs ?? 60_000);
  timer.unref();
  const stop = () => { clearInterval(timer); globalThis.__needsInputPushStop = undefined; };
  globalThis.__needsInputPushStop = stop;
  return stop;
}
