import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { enLocale } = await jiti.import("./messages/en.ts");
const { frLocale } = await jiti.import("./messages/fr.ts");

test("fr has every en key and nothing else", () => {
  assert.deepEqual(Object.keys(frLocale.messages).sort(), Object.keys(enLocale.messages).sort());
  assert.equal(frLocale.id, "fr");
});

test("fr keeps the {placeholders} of en", () => {
  for (const [key, en] of Object.entries(enLocale.messages)) {
    const holes = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(holes(frLocale.messages[key]), holes(en), key);
  }
});
