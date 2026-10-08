import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-feedpoll-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url);
const poll = await jiti.import("./feed-poll.ts");
const src = await jiti.import("./feed-source.ts");
const store = await jiti.import("./trigger-store.ts");
const sched = await jiti.import("./scheduler.ts");
const log = await jiti.import("./trigger-log.ts");

const ID = "00000000-0000-4000-8000-0000000000aa";
const trigger = { id: ID, name: "t", profile: "p", enabled: true, everyMinutes: 5, promptTemplate: "go", source: { kind: "feed", url: "https://blog.example/f" } };
const xml = `<rss><channel><item><title>A</title><link>https://b/a</link><guid>a</guid></item></channel></rss>`;
const deps = (over = {}) => ({ admit: () => true, claim: sched.claimFireToken, createTask: () => "task", fetch: async () => new Response(xml), ...over });

test("a createTask throw frees the batch token and keeps the entries unseen", async () => {
  const realError = console.error;
  console.error = () => {};
  try {
    await poll.pollFeedTriggers(0, [trigger], deps({ createTask: () => { throw new Error("disk full"); } }));
  } finally { console.error = realError; }
  const hash = src.hash16(src.entryHash({ id: "a", title: "", link: "" }));
  assert.equal(existsSync(join(store.triggersDir(), src.feedToken(ID, hash))), false);
  assert.deepEqual(src.readFeedState(ID).seen, []);
  const tasks = [];
  await poll.pollFeedTriggers(5 * 60_000, [trigger], deps({ createTask: (_t, prompt) => { tasks.push(prompt); return "task"; } }));
  assert.equal(tasks.length, 1); // the next bucket retries the same batch
});

test("a failing feed journals one line per reason and hour", async () => {
  const failing = { ...trigger, id: "00000000-0000-4000-8000-0000000000ab" };
  const bad = { fetch: async () => new Response("no", { status: 500 }) };
  await poll.pollFeedTriggers(10 * 60_000, [failing], deps(bad));
  await poll.pollFeedTriggers(15 * 60_000, [failing], deps(bad));
  const lines = log.readTriggerLog(failing.id, 10);
  assert.equal(lines.length, 1);
  assert.match(lines[0].reason, /feed: HTTP 500/);
});
