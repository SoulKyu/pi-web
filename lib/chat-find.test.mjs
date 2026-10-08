import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { findInMessages, stepFindIndex } = await jiti.import("./chat-find.ts");

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content, model: "m", provider: "p" });

test("user text and assistant text blocks match case-insensitively, in transcript order", () => {
  const messages = [
    user("Deploy the API"),
    assistant([
      { type: "thinking", thinking: "deploy plan" },
      { type: "text", text: "First" },
      { type: "toolCall", id: "1", name: "bash", arguments: { command: "deploy" } },
      { type: "text", text: "DEPLOY done" },
      { type: "text", text: "redeploy later" },
    ]),
    { role: "toolResult", toolCallId: "1", toolName: "bash", content: [{ type: "text", text: "deploy ok" }], isError: false },
    user([{ type: "image", source: { type: "base64", data: "", mediaType: "image/png" } }, { type: "text", text: "Redeploy?" }]),
  ];
  assert.deepEqual(findInMessages(messages, ["u1", "a1", "t1", "u2"], "deploy"), [
    { entryId: "u1" },
    { entryId: "a1", blockIndex: 3 },
    { entryId: "a1", blockIndex: 4 },
    { entryId: "u2" },
  ]);
});

test("the query is a literal substring, trimmed, accents folded by case only; blank finds nothing", () => {
  const messages = [user("a.b (x) [y]"), user("axb"), user("ÉTÉ chaud")];
  const ids = ["1", "2", "3"];
  assert.deepEqual(findInMessages(messages, ids, "a.b"), [{ entryId: "1" }]);
  assert.deepEqual(findInMessages(messages, ids, "(x) [y"), [{ entryId: "1" }]);
  assert.deepEqual(findInMessages(messages, ids, "  AXB "), [{ entryId: "2" }]);
  assert.deepEqual(findInMessages(messages, ids, "été"), [{ entryId: "3" }]);
  assert.deepEqual(findInMessages(messages, ids, "   "), []);
});

test("messages without an entry id, or with unexpected content, are skipped", () => {
  assert.deepEqual(findInMessages([user("hello"), user("hello")], [undefined, "2"], "hello"), [{ entryId: "2" }]);
  assert.deepEqual(findInMessages([{ role: "user" }, { role: "assistant" }], ["1", "2"], "x"), []);
});

test("stepFindIndex wraps both ways, starts at the first or last, and recovers when the list shrank", () => {
  assert.equal(stepFindIndex(-1, 3, 1), 0);
  assert.equal(stepFindIndex(-1, 3, -1), 2);
  assert.equal(stepFindIndex(1, 3, 1), 2);
  assert.equal(stepFindIndex(2, 3, 1), 0);
  assert.equal(stepFindIndex(0, 3, -1), 2);
  assert.equal(stepFindIndex(5, 3, 1), 0);
  assert.equal(stepFindIndex(0, 0, 1), -1);
});
