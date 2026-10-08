import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialog = await readFile(new URL("./QueueTaskDialog.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../../app/api/agents/[name]/tasks/route.ts", import.meta.url), "utf8");

test("the client cap mirrors the route's PROMPT_MAX and counts as it does (UTF-16 length)", () => {
  const cap = (source) => source.match(/const PROMPT_MAX = ([\d_]+);/)?.[1];
  assert.equal(cap(dialog), "20_000");
  assert.equal(cap(dialog), cap(route));
  assert.match(route, /prompt\.length > PROMPT_MAX/);
  assert.match(dialog, /const overCap = prompt\.length > PROMPT_MAX;/);
  assert.match(dialog, /const showLength = prompt\.length > PROMPT_MAX \/ 2;/);
  assert.doesNotMatch(dialog, /\[\.\.\.prompt\]|Array\.from\(prompt\)/);
});

test("counter above half with exact localized figures, not a live region; over the cap Queue is disabled with an alert", () => {
  assert.match(dialog, /new Intl\.NumberFormat\(locale\)\.format\(value\)/);
  const counter = dialog.slice(dialog.indexOf("{showLength && <span"), dialog.indexOf('t("agents.tasks.promptLength"'));
  assert.ok(counter.length > 0, "counter span found");
  assert.doesNotMatch(counter, /aria-live|role=/);
  assert.match(dialog, /\{overCap && <span role="alert"[^>]*>\{t\("agents\.tasks\.promptTooLong", \{ max: formatCount\(PROMPT_MAX\) \}\)\}/);
  assert.match(dialog, /disabled=\{busy \|\| !prompt\.trim\(\) \|\| overCap\}/);
  assert.match(dialog, /aria-describedby=\{showLength \? lengthId : undefined\}/);
});

test("the counter strings exist in all four locales", async () => {
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["agents.tasks.promptLength", "agents.tasks.promptTooLong"]) assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
  }
});

test("onQueued gets the target; errors are red and localized; the quote is clipped to the route cap with a note", () => {
  assert.match(dialog, /onQueued: \(target: string\) => void/);
  assert.match(dialog, /onQueued\(target\);/);
  assert.match(dialog, /const ERROR_COLOR = "#e5484d";/);
  assert.match(dialog, /\{error && <span role="alert" style=\{\{ color: ERROR_COLOR \}\}>/);
  assert.doesNotMatch(dialog, /role="alert" style=\{\{ color: "var\(--text-muted\)" \}\}/);
  assert.match(dialog, /const errorKey = error \? queueErrorKey\(error\) : null;/);
  assert.match(dialog, /quote: sentQuote\.text/);
  assert.doesNotMatch(dialog, /\{ quote \}/);
  assert.match(dialog, /sentQuote\?\.clipped && quote && <span role="note"/);
});

test("the review dialog has its own placeholder, submit label and a Review: first line; a hand-over is prefilled and names the @ shortcut", () => {
  assert.match(dialog, /t\(review \? "agents\.askReview\.placeholder" : "agents\.tasks\.promptPlaceholder"\)/);
  assert.match(dialog, /t\(review \? "agents\.askReview\.submit" : "agents\.tasks\.queue"\)/);
  assert.match(dialog, /\[excerpt \? t\("agents\.askReview\.titleLine", \{ excerpt \}\) : "", t\("agents\.askReview\.prompt"\)\]\.filter\(Boolean\)/);
  assert.match(dialog, /deliverTo \? t\("agents\.handTo\.prompt"\) : ""/);
  assert.match(dialog, /deliverTo && !review && <span[^>]*>\{t\("agents\.handTo\.mentionHint", \{ name: target \}\)\}/);
});

test("the dialog strings exist in all four locales", async () => {
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["agents.handTo.prompt", "agents.askReview.titleLine", "agents.askReview.placeholder", "agents.askReview.submit", "agents.handTo.quoteClipped", "agents.handTo.mentionHint", "agents.handTo.errorQuoteTooLong", "agents.handTo.errorUnknownAgent"]) assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
  }
});

test("the target select always shows, marks paused and busy agents, and explains the missing self", () => {
  assert.match(dialog, /targetAgents\?: HandTarget\[\]/);
  assert.match(dialog, /\{targetAgents && \(/);
  assert.doesNotMatch(dialog, /targetAgents\.length > 1/);
  assert.match(dialog, /agent\.paused \? `\$\{agent\.name\} \$\{t\("agents\.handTo\.paused"\)\}` : !review && agent\.running \? `\$\{agent\.name\} \$\{t\("agents\.handTo\.busy"\)\}` : agent\.name/);
  assert.match(dialog, /aria-describedby=\{deliverTo \? selfHintId : undefined\}/);
  assert.match(dialog, /<span id=\{selfHintId\}[^>]*>\{t\("agents\.handTo\.selfHint", \{ name: deliverTo \}\)\}/);
  for (const key of ["agents.handTo.selfHint", "agents.handTo.paused", "agents.handTo.busy"]) assert.ok(dialog.includes(`"${key}"`), key);
});

test("a review target never says busy: an isolated review run does not wait for the thread", () => {
  assert.match(dialog, /: !review && agent\.running \? /);
});
