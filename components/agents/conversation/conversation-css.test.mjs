import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const css = await read("../../../app/agent-conversation.css");
const layout = await read("../../../app/layout.tsx");
const OFF_PALETTE = /#(?!(?:000|000000|fff|ffffff)\b)[0-9a-f]{3,8}\b|rgba?\(\s*(?!0[\s,]+0[\s,]+0\b|0 216 255\b|255 154 0\b|255 77 94\b)\d/i;
const SPEECH = '[data-tool="agent_notify"], [data-tool="agent_approve"], [data-tool="agent_delegate"]';

test("the sheet loads after the Tron sidebar sheet", () => {
  assert.match(layout, /import "\.\/sidebar-tron\.css";\nimport "\.\/agent-conversation\.css";/);
});

test("no off-palette colour literal", () => {
  assert.equal(css.replace(/\/\*[\s\S]*?\*\//g, "").match(OFF_PALETTE), null);
});

test("details off hides thinking and non-speech tool calls, and messages left with nothing to show", () => {
  const NR = ":not([data-revealed] *)";
  assert.ok(css.includes(`[data-agent-details="off"] [data-block="thinking"]${NR}`));
  assert.ok(css.includes(`[data-agent-details="off"] [data-block="toolCall"]:not(${SPEECH})${NR}`));
  assert.ok(css.includes(`[data-agent-details="off"] [data-message-role="assistant"]:not(:has([data-block="text"], ${SPEECH}, [role="alert"]))${NR}`));
  assert.ok(css.includes(`[data-agent-details="off"] [data-process] [data-message-role="assistant"]:not(:has(${SPEECH}, [role="alert"]))${NR}`));
  assert.ok(css.includes(`[data-agent-details="off"] [data-process] [data-block="text"]${NR}`));
});

test("every details-off hiding rule spares a revealed process", () => {
  const hiding = css.split("\n").filter((line) => line.startsWith('[data-agent-details="off"]'));
  assert.ok(hiding.length >= 5);
  for (const line of hiding) assert.match(line, /:not\(\[data-revealed\] \*\)(,| \{ display: none; \})$/, line);
});

test("the code-block language label uses the UI font in the thread", () => {
  assert.match(css, /\[data-chat-style="agent"\] \.markdown-code-lang \{ font-family: var\(--font-ui\);/);
});

test("readability: prose fills the column, 15px body, 1.6 line height, no HUD font in the thread", () => {
  assert.doesNotMatch(css, /max-width:\s*\d+ch/);
  assert.match(css, /--chat-font-size-offset: calc\(var\(--chat-content-font-size, 14px\) - 13px\)/);
  assert.match(css, /line-height: 1\.6/);
  assert.doesNotMatch(css, /font-hud|orbitron/i);
});

test("reduced motion stops the working pulse", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.conv-working[\s\S]*animation: none/);
});
