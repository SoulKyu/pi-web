import assert from "node:assert/strict";
import test from "node:test";
const { curationPrompt } = await (await import("jiti")).createJiti(import.meta.url).import("./curation-prompt.ts");

const prompt = curationPrompt("leandro", "/x/mem0/agents/leandro.json");

test("the prompt names the snapshot file and its ids", () => {
  assert.ok(prompt.includes("/x/mem0/agents/leandro.json"));
  assert.match(prompt, /ids/);
});

test("the agent reads the file, never searches the store", () => {
  assert.doesNotMatch(prompt, /memory_search/);
});

test("memory_forget is for exact duplicates only; the user decides the rest", () => {
  assert.equal(prompt.match(/memory_forget/g).length, 1);
  assert.match(prompt, /exact duplicates keep the newest and call memory_forget/);
  assert.match(prompt, /Do NOT forget them yourself: the user decides/);
});
