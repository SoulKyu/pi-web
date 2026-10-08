import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

process.env.PI_CODING_AGENT_DIR ??= "/tmp/pi-mention-test";
const jiti = createJiti(import.meta.url);
const { parseAgentMention, agentMentionMatches } = await jiti.import("./mention.ts");
const agents = ["Scout", "Builder"];

test("parseAgentMention: start-only, exact name, non-empty prompt", () => {
  assert.deepEqual(parseAgentMention("@Scout check the logs", agents), { agent: "Scout", prompt: "check the logs" });
  assert.deepEqual(parseAgentMention("  @Builder\nline1\nline2  ", agents), { agent: "Builder", prompt: "line1\nline2" });
  assert.equal(parseAgentMention("@Scout", agents), null);
  assert.equal(parseAgentMention("@Scout   ", agents), null);
  assert.equal(parseAgentMention("@scout hi", agents), null);
  assert.equal(parseAgentMention("@Nobody hi", agents), null);
  assert.equal(parseAgentMention("hello @Scout hi", agents), null);
  assert.equal(parseAgentMention("@Scoutx hi", agents), null);
});

test("agentMentionMatches: case-insensitive prefix, exact names returned", () => {
  assert.deepEqual(agentMentionMatches("", agents), ["Scout", "Builder"]);
  assert.deepEqual(agentMentionMatches("sc", agents), ["Scout"]);
  assert.deepEqual(agentMentionMatches("x", agents), []);
});

test("the send path consults the mention parser before prompting, only with mentionAgents", async () => {
  const src = await readFile(new URL("../../components/ChatInput.tsx", import.meta.url), "utf8");
  const send = src.slice(src.indexOf("const handleSend = useCallback"));
  const body = send.slice(0, send.indexOf("}, [value"));
  assert.ok(body.indexOf("parseAgentMention") !== -1 && body.indexOf("parseAgentMention") < body.indexOf("onSend("));
  assert.match(body, /mentionAgents && onQueueMention/);
});
