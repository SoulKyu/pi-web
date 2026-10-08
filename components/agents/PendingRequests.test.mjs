import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./PendingRequests.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

test("the strip polls only while the tab is visible and stops when it hides", () => {
  assert.match(source, /if \(document\.visibilityState !== "visible"\) return;/);
  assert.match(source, /document\.addEventListener\("visibilitychange", sync\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", sync\)/);
  assert.match(source, /clearInterval\(timer\);\n\s*timer = undefined;/);
  assert.match(source, /fetch\("\/api\/agent-ops\/tasks", \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(source, /outgoingRequests\(data\.tasks, agentName\)/);
});

test("a row cancels through DELETE, says what it waits on, and an empty list renders nothing", () => {
  assert.match(source, /requestTaskAction\(`\/api\/agent-ops\/tasks\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(source, /t\(task\.status === "running" \? "agents\.pending\.running" : "agents\.pending\.queued", \{ name: task\.agent \?\? "\?", age: formatTaskDuration\(task\) \}\)/);
  assert.match(source, /aria-label=\{t\("agents\.pending\.cancel", \{ title: task\.title \}\)\}/);
  assert.match(source, /if \(tasks\.length === 0\) return null;/);
  assert.match(source, /role="region" aria-label=\{t\("agents\.pending\.label"\)\}/);
});

test("the strip yields its height to the phone keyboard", () => {
  assert.match(css, /@media \(max-width: 640px\), \(pointer: coarse\) and \(max-height: 500px\) \{\s*html\[data-keyboard-open\] \.agent-pending-strip \{ display: none; \}/);
});

test("a cancel moves focus to the next row's Cancel, else the previous one, and a later poll never brings the row back", () => {
  assert.match(source, /cancelledRef\.current\.add\(id\);/);
  assert.match(source, /outgoingRequests\(data\.tasks, agentName\)\.filter\(\(task\) => !cancelledRef\.current\.has\(task\.id\)\)/);
  assert.match(source, /row\?\.nextElementSibling\?\.matches\("\.agent-pending-item"\) \? row\.nextElementSibling : row\?\.previousElementSibling/);
  assert.ok(source.indexOf('querySelector("button")?.focus()') < source.indexOf("setTasks((current) => current.filter"), "focus moves before the row unmounts");
});
