import type { RunOutcome } from "./runner";
import { checkActiveTriggerTools } from "./trigger-store";

type WrapperEvent = { type: string; errorMessage?: string; message?: { role?: string; stopReason?: string; errorMessage?: string } };

/** The slice of AgentSessionWrapper (lib/rpc-manager.ts) these helpers rely on. */
export interface PromptRunSession {
  onEvent(listener: (event: WrapperEvent) => void): () => void;
  send(command: Record<string, unknown>): Promise<unknown>;
  shutdown(): Promise<void>;
  waitUntilReady(): Promise<void>;
}

/** The authoritative trigger tool check: the tools the session actually activated, extension
 *  tools included (lib/rpc-manager.ts:1104). The profile hash cannot see installed extensions.
 *  `get_tools` does not wait for extension binding, so wait first. Refusal or any failure shuts the session down. */
export async function enforceTriggerTools(session: PromptRunSession): Promise<void> {
  try {
    await session.waitUntilReady();
    const tools = await session.send({ type: "get_tools" }) as Array<{ name: string; active: boolean }>;
    const refusal = checkActiveTriggerTools(tools.filter((t) => t.active).map((t) => t.name));
    if (refusal) throw new Error(refusal);
  } catch (error) {
    await session.shutdown().catch(() => {});
    throw error;
  }
}

/** Sends the prompt and settles `done` from the session's events. */
export async function watchPromptRun(
  session: PromptRunSession, prompt: string,
): Promise<{ done: Promise<RunOutcome>; abort(): Promise<void> }> {
  let resolveDone!: (value: RunOutcome) => void;
  let rejectDone!: (error: Error) => void;
  const done = new Promise<RunOutcome>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  let settled = false;
  // A provider failure resolves prompt() normally and leaves stopReason "error" on the last
  // assistant message (lib/subagent-runtime.ts:89-99). Auto-retry may emit several; the last wins.
  let lastAssistant: WrapperEvent["message"];
  const settle = (fn: () => void) => { if (!settled) { settled = true; unsubscribe(); fn(); } };
  const unsubscribe = session.onEvent((event) => {
    if (event.type === "message_end" && event.message?.role === "assistant") {
      lastAssistant = event.message;
    } else if (event.type === "prompt_done") {
      settle(() => {
        if (lastAssistant?.stopReason === "error") {
          rejectDone(new Error(lastAssistant.errorMessage || "Provider returned an error"));
        } else if (lastAssistant?.stopReason === "aborted") {
          resolveDone({ status: "cancelled" });
        } else {
          // get_last_assistant_text answers { text } (lib/rpc-manager.ts:1078), not a string.
          void Promise.resolve(session.send({ type: "get_last_assistant_text" }))
            .then((value) => resolveDone({ status: "completed", result: (value as { text?: string } | null)?.text || undefined }))
            .catch(() => resolveDone({ status: "completed" }));
        }
      });
    } else if (event.type === "prompt_error") {
      settle(() => rejectDone(new Error(event.errorMessage ?? "prompt failed")));
    }
  });
  try {
    // A preflight rejection THROWS here and emits neither prompt_done nor
    // prompt_error (lib/rpc-manager.ts:833-836): settle `done` ourselves.
    await session.send({ type: "prompt", message: prompt });
  } catch (error) {
    settle(() => rejectDone(error instanceof Error ? error : new Error(String(error))));
  }
  return { done, abort: async () => { await session.send({ type: "abort" }); } };
}
