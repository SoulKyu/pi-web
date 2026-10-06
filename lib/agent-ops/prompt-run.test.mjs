import assert from "node:assert/strict";
import { test } from "node:test";
const { watchPromptRun, enforceTriggerTools } = await (await import("jiti")).createJiti(import.meta.url).import("./prompt-run.ts");

/** Fake wrapper: records sent commands, lets the test emit events. */
function fakeSession({ sendPrompt = async () => null, lastText = { text: "final" }, tools = [] } = {}) {
  let listener = null;
  const sent = [];
  let shutdowns = 0;
  return {
    sent,
    get listening() { return listener !== null; },
    get shutdowns() { return shutdowns; },
    emit: (event) => listener?.(event),
    onEvent(l) { listener = l; return () => { listener = null; }; },
    async shutdown() { shutdowns++; },
    async send(cmd) {
      sent.push(cmd.type);
      if (cmd.type === "prompt") return sendPrompt(cmd);
      if (cmd.type === "get_last_assistant_text") return lastText;
      if (cmd.type === "get_tools") return tools;
      return null;
    },
  };
}
const assistantEnd = (message = {}) => ({ type: "message_end", message: { role: "assistant", ...message } });

test("prompt_done completes with the text of get_last_assistant_text and unsubscribes", async () => {
  const s = fakeSession();
  const run = await watchPromptRun(s, "go");
  s.emit(assistantEnd({ stopReason: "stop" }));
  s.emit({ type: "prompt_done" });
  assert.deepEqual(await run.done, { status: "completed", result: "final" });
  assert.deepEqual(s.sent, ["prompt", "get_last_assistant_text"]);
  assert.equal(s.listening, false);
});

test("stopReason error rejects with its errorMessage; the last assistant message wins", async () => {
  const s = fakeSession();
  const run = await watchPromptRun(s, "go");
  s.emit(assistantEnd({ stopReason: "error", errorMessage: "retry me" }));
  s.emit(assistantEnd({ stopReason: "error", errorMessage: "boom" }));
  s.emit({ type: "prompt_done" });
  await assert.rejects(run.done, /boom/);
  assert.equal(s.listening, false);
});

test("stopReason aborted resolves cancelled", async () => {
  const s = fakeSession();
  const run = await watchPromptRun(s, "go");
  s.emit(assistantEnd({ stopReason: "aborted" }));
  s.emit({ type: "prompt_done" });
  assert.deepEqual(await run.done, { status: "cancelled" });
});

test("prompt_error rejects", async () => {
  const s = fakeSession();
  const run = await watchPromptRun(s, "go");
  s.emit({ type: "prompt_error", errorMessage: "model gone" });
  await assert.rejects(run.done, /model gone/);
  assert.equal(s.listening, false);
});

test("a preflight rejection of the prompt send rejects done without any event", async () => {
  const s = fakeSession({ sendPrompt: async () => { throw new Error("no model selected"); } });
  const run = await watchPromptRun(s, "go");
  await assert.rejects(run.done, /no model selected/);
  assert.equal(s.listening, false);
});

test("abort sends abort to the session", async () => {
  const s = fakeSession();
  const run = await watchPromptRun(s, "go");
  await run.abort();
  assert.deepEqual(s.sent, ["prompt", "abort"]);
});

test("enforceTriggerTools shuts the session down and throws on a refused tool", async () => {
  const s = fakeSession({ tools: [{ name: "read", active: true }, { name: "bash", active: true }] });
  await assert.rejects(enforceTriggerTools(s), /outside the allowlist: bash/);
  assert.equal(s.shutdowns, 1);
});

test("enforceTriggerTools ignores inactive tools and keeps an accepted session", async () => {
  const s = fakeSession({ tools: [{ name: "read", active: true }, { name: "bash", active: false }] });
  await enforceTriggerTools(s);
  assert.equal(s.shutdowns, 0);
});
