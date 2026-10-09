import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const view = await readFile(new URL("../../MessageView.tsx", import.meta.url), "utf8");

test("MessageView takes a boolean conversation prop and compares it in memo", () => {
  assert.match(view, /conversation\?: boolean;/);
  assert.match(view, /&& prev\.conversation === next\.conversation/);
});

test("conversation mode tags assistant blocks for the CSS and drops the model label row", () => {
  assert.match(view, /data-block=\{block\.type\}/);
  assert.match(view, /data-tool=\{block\.type === "toolCall" \? \(block as ToolCallContent\)\.toolName : undefined\}/);
  assert.match(view, /\{!conversation && \(\s*<>\s*\{\/\* Model label \*\/\}/);
});

test("conversation mode renders the user message left-aligned without the chamfered bubble", () => {
  assert.match(view, /data-message-role=\{conversation \? "user" : undefined\}/);
  assert.match(view, /alignItems: conversation \? "stretch" : "flex-end"/);
  assert.match(view, /const Bubble = conversation \? PlainBubble : Chamfer;/);
});
