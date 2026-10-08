import assert from "node:assert/strict";
import { test } from "node:test";
const { hookCurl, hookUrl, nextFireHint, tasksOfTrigger, triggerActivity } = await (await import("jiti")).createJiti(import.meta.url).import("./trigger-view.ts");

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

const at = (hh, mm, ss = 0) => Date.UTC(2026, 9, 8, hh, mm, ss);
const iso = (ms) => new Date(ms).toISOString();

test("nextFireHint: the next epoch-aligned bucket after the last fire, as the scheduler fires", () => {
  const hourly = { enabled: true, everyMinutes: 60 };
  assert.deepEqual(nextFireHint(hourly, iso(at(10, 0, 30)), at(10, 20)), { everyInMinutes: 40 });
  // created and first fired mid-bucket: the next fire is the bucket boundary, not last + 60
  assert.deepEqual(nextFireHint(hourly, iso(at(10, 23)), at(10, 23)), { everyInMinutes: 37 });
  assert.deepEqual(nextFireHint(hourly, iso(at(10, 0, 30)), at(10, 59, 30)), { everyInMinutes: 1 });
});

test("nextFireHint: overdue or never fired reads soon", () => {
  const hourly = { enabled: true, everyMinutes: 60 };
  assert.deepEqual(nextFireHint(hourly, iso(at(9, 0, 30)), at(10, 5)), { everyInMinutes: "soon" });
  assert.deepEqual(nextFireHint(hourly, undefined, at(10, 5)), { everyInMinutes: "soon" });
  assert.deepEqual(nextFireHint(hourly, "not a date", at(10, 5)), { everyInMinutes: "soon" });
});

test("nextFireHint: daily time as written, both when both are set, nothing for disabled, webhook-only or feed-only", () => {
  assert.deepEqual(nextFireHint({ enabled: true, at: "07:30" }, undefined, at(10, 0)), { dailyAt: "07:30" });
  assert.deepEqual(nextFireHint({ enabled: true, everyMinutes: 60, at: "07:30" }, iso(at(10, 0, 30)), at(10, 20)), { everyInMinutes: 40, dailyAt: "07:30" });
  assert.equal(nextFireHint({ enabled: false, everyMinutes: 60, at: "07:30" }, undefined, at(10, 0)), null);
  assert.equal(nextFireHint({ enabled: true }, undefined, at(10, 0)), null);
  const feed = { enabled: true, everyMinutes: 15, source: { kind: "feed", url: "https://example.com/feed.xml" } };
  assert.equal(nextFireHint(feed, undefined, at(10, 0)), null);
  assert.deepEqual(nextFireHint({ ...feed, at: "08:00" }, undefined, at(10, 0)), { dailyAt: "08:00" });
});

test("trigger cards show the hint in the wrapping activity line, four locales", async () => {
  const { readFile } = await import("node:fs/promises");
  const card = await readFile(new URL("./AgentTriggers.tsx", import.meta.url), "utf8");
  assert.match(card, /const nextFire = nextFireHint\(trigger, lastFireAt\);/);
  assert.match(card, /\{nextFireText && <span>\{nextFireText\}<\/span>\}/);
  assert.match(card, /<div style=\{\{ display: "flex", flexWrap: "wrap", columnGap: 12, rowGap: 2, fontSize: 11, color: "var\(--text-dim\)" \}\}>/);
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["agentOps.trigger.nextIn", "agentOps.trigger.nextSoon", "agentOps.trigger.nextDaily"]) assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
  }
});
