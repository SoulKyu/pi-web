import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { clipQuote, QUOTE_MAX, queueErrorKey, reviewExcerpt } = await (await import("jiti")).createJiti(import.meta.url).import("./queue-task-view.ts");
const route = await readFile(new URL("../../app/api/agents/[name]/tasks/route.ts", import.meta.url), "utf8");

test("QUOTE_MAX mirrors the route's cap", () => {
  assert.equal(QUOTE_MAX, 20_000);
  assert.match(route, /const QUOTE_MAX = 20_000;/);
  assert.match(route, /quote\.length > QUOTE_MAX/);
});

test("clipQuote keeps a quote at the cap and cuts a longer one to fit, saying how much", () => {
  assert.deepEqual(clipQuote("abc", 10), { text: "abc", clipped: false, kept: 3 });
  assert.equal(clipQuote("x".repeat(QUOTE_MAX)).clipped, false);
  const long = "y".repeat(25_000);
  const clipped = clipQuote(long);
  assert.equal(clipped.clipped, true);
  assert.ok(clipped.text.length <= QUOTE_MAX, String(clipped.text.length));
  assert.ok(clipped.text.endsWith(`…[truncated, ${clipped.kept} of 25000 characters]`));
  assert.equal(clipped.text.slice(0, clipped.kept), long.slice(0, clipped.kept));
});

test("clipQuote never splits a surrogate pair at the cut", () => {
  for (let pad = 0; pad < 4; pad++) {
    const clipped = clipQuote("a".repeat(pad) + "😀".repeat(15_000));
    assert.ok(clipped.text.length <= QUOTE_MAX, `pad ${pad}`);
    const last = clipped.text.charCodeAt(clipped.kept - 1);
    assert.ok(!(last >= 0xd800 && last <= 0xdbff), `pad ${pad}: lone high surrogate`);
  }
});

test("reviewExcerpt takes the first non-empty line without markdown markers, at most 60 chars", () => {
  assert.equal(reviewExcerpt("\n\n## Plan for the migration\nstep 1"), "Plan for the migration");
  assert.equal(reviewExcerpt("- item one"), "item one");
  assert.equal(reviewExcerpt("> quoted"), "quoted");
  const long = reviewExcerpt("z".repeat(200));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith("…"));
  assert.equal(reviewExcerpt("   \n\n"), "");
});

test("queueErrorKey maps the route's known refusals and leaves the rest raw", () => {
  assert.equal(queueErrorKey("quote must be a string of at most 20000 characters"), "agents.handTo.errorQuoteTooLong");
  assert.equal(queueErrorKey("deliverTo must name an existing agent"), "agents.handTo.errorUnknownAgent");
  assert.equal(queueErrorKey("Agent not found"), "agents.handTo.errorUnknownAgent");
  assert.equal(queueErrorKey("prompt is limited to 20000 characters"), "agents.tasks.promptTooLong");
  assert.equal(queueErrorKey("HTTP 502"), null);
  // The mapping follows the route's wording: a reword must fail here.
  assert.match(route, /`quote must be a string of at most \$\{QUOTE_MAX\} characters`/);
  assert.match(route, /"deliverTo must name an existing agent"/);
  assert.match(route, /"Agent not found"/);
  assert.match(route, /`prompt is limited to \$\{PROMPT_MAX\} characters`/);
});
