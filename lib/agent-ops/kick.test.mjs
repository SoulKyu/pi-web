import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source pins: importing kick.ts would load rpc-manager.
const source = readFileSync(new URL("./kick.ts", import.meta.url), "utf8");

test("kickRunner drives an isolated runner and a per-agent thread runner", () => {
  assert.match(source, /slotKey: "__agentOpsRunning"[\s\S]*select: \(queued\) => selectIsolatedTasks\(queued, pausedNow\)/);
  assert.match(source, /slotKey: "__agentOpsThreadRunning"[\s\S]*selectThreadTasks\(/);
  assert.match(source, /maxConcurrent: Number\.POSITIVE_INFINITY/);
  assert.match(source, /start: startThreadEventRun/);
  assert.equal(source.match(/capacity,/g)?.length, 2);
  assert.equal(source.match(/onTaskEnd: handleTaskEnd/g)?.length, 2);
});

test("a starting thread counts as busy", () => {
  assert.match(source, /isRpcSessionStarting\(/);
});

test("a finished webhook run posts a display-only summary card without blocking or throwing", () => {
  const end = source.slice(source.indexOf("export function handleTaskEnd"), source.indexOf("export function kickRunner") > 0 ? source.indexOf("/** Single runner entry point") : undefined);
  assert.match(end, /if \(task\.target === "isolated"\)/);
  assert.match(end, /webhookEventOfTask\(\{ \.\.\.task, \.\.\.\(task\.usage \? \{ costEquivalent: priceRecord\(task\.usage\)\.costEquivalent \} : \{\}\), result: task\.result && redactSecrets\(task\.result\), error: task\.error && redactSecrets\(task\.error\) \}\)/);
  assert.match(end, /await appendThreadEvent\(agent, event\)\.catch\(/);
});

test("the failure push is grouped per agent", () => {
  assert.match(source, /tag: `pi-agent:\$\{agentName\}`/);
});

test("an isolated start re-checks the task and the pause before its prompt", () => {
  assert.match(source, /startAgentProfileRun\(task, \(\) => assertTaskStillStartable\(task\)\)/);
});

test("every pass first fails the queued trigger tasks of an over-budget agent", () => {
  assert.match(source, /export function kickRunner\(\): Promise<void> \{\n  try \{ failOverBudgetTriggerTasks\(\); \} catch \(error\) \{ log\(error\); \}/);
});

test("a terminal run checks the daily budget push for its agent", () => {
  assert.match(source, /void pushBudgetReachedOnce\(agentName\)/);
});

test("the failure push follows the summary card and links to its entry for an isolated run", () => {
  const end = source.slice(source.indexOf("export function handleTaskEnd"), source.indexOf("/** Single runner entry point"));
  assert.match(end, /entryId = await appendThreadEvent\(agent, event\)/);
  assert.match(end, /&entry=\$\{encodeURIComponent\(entryId\)\}/);
  assert.ok(end.indexOf("await appendThreadEvent") < end.indexOf("notifyAgent("));
});

test("a task delivered to another agent posts a delegation card there, after the summary card and before the push, never a prompt", () => {
  const end = source.slice(source.indexOf("export function handleTaskEnd"), source.indexOf("/** Single runner entry point"));
  assert.match(end, /task\.deliverTo/);
  assert.match(end, /delegationEventOfTask\(\{ \.\.\.task, result: task\.result && redactSecrets\(task\.result\), error: task\.error && redactSecrets\(task\.error\) \}\)/);
  assert.match(end, /appendThreadEvent\(recipient, delegation\)/);
  assert.ok(end.indexOf("await appendThreadEvent(agent, event)") < end.indexOf("appendThreadEvent(recipient, delegation)"));
  assert.ok(end.indexOf("appendThreadEvent(recipient, delegation)") < end.indexOf("notifyAgent("));
  const block = end.slice(end.indexOf("if (task.deliverTo)"), end.indexOf('if (task.status !== "failed")'));
  assert.doesNotMatch(block, /startThreadEventRun|\.send\(|prompt/);
});

test("a delivered card pushes the requester with its entry, on completion and failure, instead of the executing agent's failure push", () => {
  const end = source.slice(source.indexOf("export function handleTaskEnd"), source.indexOf("/** Single runner entry point"));
  assert.match(end, /delivered = \{ to: recipient\.name, entryId: await appendThreadEvent\(recipient, delegation\) \}/);
  const push = end.slice(end.indexOf("if (delivered)"), end.indexOf('if (task.status !== "failed")'));
  assert.ok(push.length > 0, "requester push block found before the failure push");
  assert.match(push, /task\.status === "failed" \? "agentDelegationFailed" : "agentDelegationDone"/);
  assert.match(push, /url: `\/\?agent=\$\{encodeURIComponent\(to\)\}&entry=\$\{encodeURIComponent\(cardId\)\}`/);
  assert.match(push, /tag: `pi-agent:\$\{to\}`/);
  assert.match(push, /\}\)\);\n\s*return;\n\s*\}/); // no second push for a delivered task
  // A card that could not be appended leaves `delivered` unset: the failure push below still fires.
  assert.match(end.slice(end.indexOf('if (task.status !== "failed")')), /url: `\/\?agent=\$\{encodeURIComponent\(agentName\)\}/);
});

test("push bodies substitute the title and name literally, so $& or $$ in a title is never expanded", () => {
  assert.equal(source.match(/\.replace\("\{(name|title)\}", \(\) => /g)?.length, 4);
  assert.doesNotMatch(source, /\.replace\("\{(name|title)\}", (?!\(\) => )/);
});
