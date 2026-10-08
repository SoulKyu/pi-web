import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-feed-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url);
const src = await jiti.import("./feed-source.ts");

const RSS = (n) => `<rss><channel>${Array.from({ length: n }, (_, i) => `<item><title>t${i}</title><link>https://x/${i}</link><guid>g${i}</guid></item>`).join("")}</channel></rss>`;
const reply = (body, init = {}) => async () => new Response(body, init);
const ID = "00000000-0000-4000-8000-000000000001";

test("sends conditional headers from the state and maps 304 to unchanged", async () => {
  let seen;
  const fetch = async (_url, init) => { seen = init; return new Response(null, { status: 304 }); };
  assert.deepEqual(await src.fetchFeed("https://x/feed", { etag: '"a"', lastModified: "Mon", seen: [] }, { fetch }), { status: "unchanged" });
  assert.equal(seen.headers["If-None-Match"], '"a"');
  assert.equal(seen.headers["If-Modified-Since"], "Mon");
  assert.equal(seen.redirect, "manual");
});

test("ok returns entries and the new validators, keeping seen", async () => {
  const result = await src.fetchFeed("https://x/feed", { seen: ["h"] }, { fetch: reply(RSS(2), { headers: { etag: "e1", "last-modified": "LM" } }) });
  assert.equal(result.status, "ok");
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.state, { etag: "e1", lastModified: "LM", seen: ["h"] });
});

test("a body past the cap is an error, streamed or not", async () => {
  const big = "x".repeat(src.FEED_MAX_BYTES + 1);
  assert.match((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: reply(big) })).reason, /larger than/);
  const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(400_000)); } });
  assert.match((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: async () => new Response(stream) })).reason, /larger than/);
});

test("http URLs, userinfo and redirects to http are errors; https redirects are followed up to 3", async () => {
  assert.match((await src.fetchFeed("http://x/f", { seen: [] }, { fetch: reply(RSS(1)) })).reason, /https/);
  assert.match((await src.fetchFeed("https://u:p@x/f", { seen: [] }, { fetch: reply(RSS(1)) })).reason, /credentials/);
  const to = (location) => async () => new Response(null, { status: 302, headers: { location } });
  assert.match((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: to("http://evil/f") })).reason, /redirect refused/);
  const calls = [];
  const hops = async (url) => { calls.push(url); return calls.length <= 3 ? new Response(null, { status: 301, headers: { location: `/h${calls.length}` } }) : new Response(RSS(1)); };
  assert.equal((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: hops })).status, "ok");
  assert.deepEqual(calls, ["https://x/f", "https://x/h1", "https://x/h2", "https://x/h3"]);
  assert.match((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: async () => new Response(null, { status: 302, headers: { location: "/loop" } }) })).reason, /too many/);
});

test("HTTP errors, network errors and timeouts are errors, never throws", async () => {
  assert.equal((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: reply("no", { status: 500 }) })).reason, "HTTP 500");
  assert.equal((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: async () => { throw new Error("boom"); } })).reason, "boom");
  const hang = (_u, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  assert.equal((await src.fetchFeed("https://x/f", { seen: [] }, { fetch: hang, timeoutMs: 20 })).reason, "timeout");
});

test("newEntries filters seen hashes; markSeen is newest-first, deduped and bounded", () => {
  const entries = [{ id: "a", title: "", link: "" }, { id: "b", title: "", link: "" }];
  assert.deepEqual(src.newEntries(entries, [src.entryHash(entries[0])]), [entries[1]]);
  const many = Array.from({ length: 600 }, (_, i) => `h${i}`);
  const marked = src.markSeen(many, ["new", "h0"]);
  assert.equal(marked.length, 500);
  assert.deepEqual(marked.slice(0, 3), ["new", "h0", "h1"]);
});

test("state round-trips at 0600 and a missing or corrupt file is empty", () => {
  assert.deepEqual(src.readFeedState(ID), { seen: [] });
  src.writeFeedState(ID, { etag: "e", seen: ["a", "b"] });
  assert.deepEqual(src.readFeedState(ID), { etag: "e", seen: ["a", "b"] });
  assert.equal(statSync(join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "triggers", `${ID}.feed.json`)).mode & 0o777, 0o600);
  assert.equal(src.feedToken(ID, "0123456789abcdef"), `${ID}.feed_0123456789abcdef`);
  assert.equal(src.hash16("x").length, 16);
});
