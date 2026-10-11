import { configureHttpDispatcher, readHttpIdleTimeoutMs } from "@/lib/http-dispatcher";
import { closeAllAgentEventStreams } from "@/lib/agent-event-stream";

export function registerNodeInstrumentation(): void {
  // The pi CLI applies settings' `httpIdleTimeoutMs` to the same undici
  // body/header timeouts, so a Web UI session gets the timeout the user
  // configured. Without it the built-in five minutes aborts a provider stream
  // that stays quiet for longer, which a CLI session tolerates.
  configureHttpDispatcher(readHttpIdleTimeoutMs());

  // In production Next 16 answers SIGINT/SIGTERM with server.close() and waits
  // for every connection to end, without a timeout. SSE streams only end when
  // the client disconnects, so close them here or the process never exits.
  const shutdownStreams = () => closeAllAgentEventStreams();
  process.on("SIGINT", shutdownStreams);
  process.on("SIGTERM", shutdownStreams);

  // Next evaluates a route's code on its first request, so the first
  // /api/sessions used to pay for importing the whole pi SDK, seconds on
  // Windows (#964). Start that import now, unawaited so register() stays fast:
  // it overlaps the browser opening, and the routes reuse Node's cached module.
  // A failure is left for the routes' own import to report.
  import("@earendil-works/pi-coding-agent").catch(() => {});

  // Dynamic and not awaited: kick pulls in rpc-manager, and a failure there must never keep the server from booting.
  void Promise.all([import("@/lib/agent-ops/kick"), import("@/lib/agent-ops/scheduler")])
    .then(([{ kickRunner }, { startScheduler }]) => startScheduler({ kick: kickRunner }))
    .catch((error) => console.error("[agent-ops] scheduler not started:", error instanceof Error ? error.message : error));

  // Same rule: a failure here must never keep the server from booting.
  void import("@/lib/agents/needs-input-push")
    .then(({ startNeedsInputPush }) => startNeedsInputPush())
    .catch((error) => console.error("[agents] needs-input push not started:", error instanceof Error ? error.message : error));
}
