import { configureHttpDispatcher } from "@/lib/http-dispatcher";
import { closeAllAgentEventStreams } from "@/lib/agent-event-stream";

export function registerNodeInstrumentation(): void {
  configureHttpDispatcher();

  // In production Next 16 answers SIGINT/SIGTERM with server.close() and waits
  // for every connection to end, without a timeout. SSE streams only end when
  // the client disconnects, so close them here or the process never exits.
  const shutdownStreams = () => closeAllAgentEventStreams();
  process.on("SIGINT", shutdownStreams);
  process.on("SIGTERM", shutdownStreams);

  // Dynamic and not awaited: kick pulls in rpc-manager, and a failure there must never keep the server from booting.
  void Promise.all([import("@/lib/agent-ops/kick"), import("@/lib/agent-ops/scheduler")])
    .then(([{ kickRunner }, { startScheduler }]) => startScheduler({ kick: kickRunner }))
    .catch((error) => console.error("[agent-ops] scheduler not started:", error instanceof Error ? error.message : error));
}
