import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { enLocale } = await jiti.import("./messages/en.ts");
const { frLocale } = await jiti.import("./messages/fr.ts");
const { zhCNLocale } = await jiti.import("./messages/zh-CN.ts");
const { zhTWLocale } = await jiti.import("./messages/zh-TW.ts");

const keys = Object.keys(enLocale.messages).filter((key) => key.startsWith("agents."));
test("every agents.* key exists in all locales with the same placeholders", () => {
  assert.ok(keys.includes("agents.new.title"));
  for (const key of keys) {
    for (const locale of [frLocale, zhCNLocale, zhTWLocale]) {
      assert.equal(typeof locale.messages[key], "string", `${locale.id} ${key}`);
      const placeholders = (text) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(",");
      assert.equal(placeholders(locale.messages[key]), placeholders(enLocale.messages[key]), `${locale.id} ${key}`);
    }
  }
});

test("prompt chips and role help keys exist", () => {
  for (const key of ["agents.new.roleHelp", "agents.prompts.hint", "agents.prompts.add"]) assert.ok(keys.includes(key), key);
});
