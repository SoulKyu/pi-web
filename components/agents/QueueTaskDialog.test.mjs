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
