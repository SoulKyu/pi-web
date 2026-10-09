import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const groupHeader = await read("./GroupHeader.tsx");
const header = await read("./ConversationHeader.tsx");
const KEYS = ["agents.chat.you", "agents.chat.youInitial", "agents.chat.working", "agents.chat.details", "agents.chat.detailsHint", "agents.chat.asks",
  "agents.presence.needsInput", "agents.presence.working", "agents.presence.failed", "agents.presence.paused", "agents.presence.quietHours",
  "agents.presence.available", "agents.presence.availableSince", "agents.rail.expand", "agents.rail.collapse"];

test("every new key exists in the four locales", async () => {
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await read(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of KEYS) assert.ok(messages.includes(`"${key}":`), `${locale}: ${key}`);
  }
});

test("the group header shows a name and a machine-readable time, the avatar is decorative", () => {
  assert.match(groupHeader, /<time className="conv-time" dateTime=/);
  assert.match(groupHeader, /className="conv-gutter" aria-hidden="true"/);
  assert.match(groupHeader, /t\("agents\.chat\.you"\)/);
});

test("the header states presence in words next to the dot and labels the details switch", () => {
  assert.match(header, /presenceOf\(/);
  assert.match(header, /data-tone=\{presence\.tone\}/);
  assert.match(header, /t\(`agents\.presence\.\$\{presence\.key\}`\)/);
  assert.match(header, /<Switch id=\{switchId\} checked=\{details\} onCheckedChange=\{onDetailsChange\}/);
  assert.match(header, /<label htmlFor=\{switchId\} className="conv-header-details"/);
  // ChatWindow already announces the phase; a live region here would re-read the ticking relative time.
  assert.doesNotMatch(header, /role="status"|aria-live/);
});
