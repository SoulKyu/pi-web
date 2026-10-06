import assert from "node:assert/strict";
import test from "node:test";
import { enLocale } from "./messages/en.ts";
import { zhCNLocale } from "./messages/zh-CN.ts";
import { zhTWLocale } from "./messages/zh-TW.ts";

const keys = Object.keys(enLocale.messages).filter((key) => key.startsWith("agents."));
test("every agents.* key exists in all locales with the same placeholders", () => {
  assert.ok(keys.includes("agents.new.title"));
  for (const key of keys) {
    for (const locale of [zhCNLocale, zhTWLocale]) {
      assert.equal(typeof locale.messages[key], "string", `${locale.id} ${key}`);
      const placeholders = (text) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(",");
      assert.equal(placeholders(locale.messages[key]), placeholders(enLocale.messages[key]), `${locale.id} ${key}`);
    }
  }
});
