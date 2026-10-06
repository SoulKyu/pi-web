import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the hook appends live agent events once, with their entry id", () => {
  const source = read("./useAgentSession.ts");
  assert.match(source, /case "custom_entry_appended":/);
  assert.match(source, /isAgentEventData\(data\)/);
  assert.match(source, /isSameEvent\(message, data\)/);
  assert.match(source, /setEntryIds\(\(prev\) => appendEntryId\(prev, messageCount, entryId\)\)/);
});

test("MessageView routes agent events to the card; ChatWindow marks event prompts", () => {
  assert.match(read("../components/MessageView.tsx"), /AGENT_EVENT_UI_TYPE[\s\S]{0,200}<AgentEventCard/);
  assert.match(read("../components/ChatWindow.tsx"), /eventPromptIndexes\(messages\)/);
});

test("the card renders the summary as plain pre-wrapped text, never markdown", () => {
  const source = read("../components/agents/AgentEventCard.tsx");
  assert.match(source, /whiteSpace: "pre-wrap"/);
  assert.doesNotMatch(source, /MarkdownBody|ReactMarkdown/);
});
