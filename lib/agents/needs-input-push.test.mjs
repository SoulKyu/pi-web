import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-needs-input-")); // before the import
const { startNeedsInputPush } = await (await import("jiti")).createJiti(import.meta.url).import("./needs-input-push.ts");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function setup(wrapper) {
  const state = { now: 100_000, pushes: [] };
  const stop = startNeedsInputPush({
    agents: () => [{ name: "leandro", threadSessionId: "t1" }, { name: "idle" }],
    wrapperOf: (id) => (id === "t1" ? wrapper : undefined),
    push: async (payloadFor) => void state.pushes.push(payloadFor("en")),
    now: () => state.now,
    intervalMs: 5,
  });
  return { state, stop };
}
const pending = (since, subscribers = 0) => ({ hasPendingUiRequests: () => true, pendingUiSince: () => since, subscriberCount: () => subscribers });

test("pushes once after 60 s of waiting, with the grouped url and the request tag", async () => {
  const { state, stop } = setup(pending(30_000));
  await sleep(40);
  stop();
  assert.equal(state.pushes.length, 1);
  assert.deepEqual(state.pushes[0], { title: "leandro", body: "leandro needs your answer", url: "/?agent=leandro", tag: "pi-agent-input:leandro:30000" });
});

test("does not push before 60 s", async () => {
  const { state, stop } = setup(pending(50_000));
  await sleep(40);
  stop();
  assert.equal(state.pushes.length, 0);
});

test("does not push while a tab is subscribed", async () => {
  const { state, stop } = setup(pending(30_000, 1));
  await sleep(40);
  stop();
  assert.equal(state.pushes.length, 0);
});

test("does not push without a pending request, and a throwing source is survived", async () => {
  const { state, stop } = setup({ hasPendingUiRequests: () => false, pendingUiSince: () => undefined, subscriberCount: () => 0 });
  await sleep(20);
  stop();
  assert.equal(state.pushes.length, 0);
  const stopThrowing = startNeedsInputPush({ agents: () => { throw new Error("boom"); }, wrapperOf: () => undefined, push: async () => {}, now: () => 0, intervalMs: 5 });
  await sleep(20);
  stopThrowing();
});

test("a second start returns the same interval: one push, not two", async () => {
  const { state, stop } = setup(pending(30_000));
  const again = startNeedsInputPush({ agents: () => [{ name: "leandro", threadSessionId: "t1" }], wrapperOf: () => pending(30_000), push: async () => void state.pushes.push("dup"), now: () => state.now, intervalMs: 5 });
  assert.equal(again, stop);
  await sleep(40);
  stop();
  assert.equal(state.pushes.length, 1);
});

test("a cleared request and a new one push again with the new since; the same request never twice", async () => {
  let current = pending(30_000);
  const { state, stop } = setup(undefined);
  stop();
  const pushes = [];
  const stop2 = startNeedsInputPush({ agents: () => [{ name: "leandro", threadSessionId: "t1" }], wrapperOf: () => current, push: async (f) => void pushes.push(f("en").tag), now: () => 100_000, intervalMs: 5 });
  await sleep(30);
  current = { hasPendingUiRequests: () => false, pendingUiSince: () => undefined, subscriberCount: () => 0 };
  await sleep(20);
  current = pending(35_000);
  await sleep(30);
  stop2();
  assert.deepEqual(pushes, ["pi-agent-input:leandro:30000", "pi-agent-input:leandro:35000"]);
  assert.equal(state.pushes.length, 0);
});
