import assert from "node:assert/strict";
import { test } from "node:test";
const { hookCurl, hookUrl, tasksOfTrigger, triggerActivity } = await (await import("jiti")).createJiti(import.meta.url).import("./trigger-view.ts");

const task = (id, triggerId, status, createdAt) => ({ id, triggerId, status, createdAt });

test("hookUrl and hookCurl point at the hook route with the secret header", () => {
  assert.equal(hookUrl("https://pi.example", "abc"), "https://pi.example/api/agent-ops/triggers/abc/hook");
  const curl = hookCurl("https://pi.example", "abc", "s3cret");
  assert.match(curl, /^curl -X POST 'https:\/\/pi\.example\/api\/agent-ops\/triggers\/abc\/hook'/);
  assert.match(curl, /-H 'x-agent-ops-secret: s3cret'/);
});

test("hookCurl shows an example body per payload format", () => {
  assert.match(hookCurl("https://pi.example", "abc", "s"), /-d '\{"text":"alert text"\}'/);
  assert.match(hookCurl("https://pi.example", "abc", "s", "raw"), /"text":"alert text"/);
  const am = hookCurl("https://pi.example", "abc", "s", "alertmanager");
  assert.match(am, /"alertname":"HighCPU"/);
  assert.equal(am.match(/"fingerprint"/g).length, 2);
  assert.match(hookCurl("https://pi.example", "abc", "s", "grafana"), /"title":/);
});

test("tasksOfTrigger keeps only the trigger's tasks; triggerActivity counts active ones and finds the newest fire", () => {
  const tasks = [
    task("1", "a", "completed", "2026-01-01T00:00:00.000Z"),
    task("2", "a", "running", "2026-01-03T00:00:00.000Z"),
    task("3", "b", "queued", "2026-01-04T00:00:00.000Z"),
    task("4", undefined, "queued", "2026-01-05T00:00:00.000Z"),
    task("5", "a", "queued", "2026-01-02T00:00:00.000Z"),
  ];
  assert.deepEqual(tasksOfTrigger(tasks, "a").map((t) => t.id), ["1", "2", "5"]);
  assert.deepEqual(triggerActivity(tasks, "a"), { active: 2, lastFireAt: "2026-01-03T00:00:00.000Z" });
  assert.deepEqual(triggerActivity(tasks, "none"), { active: 0, lastFireAt: undefined });
});
