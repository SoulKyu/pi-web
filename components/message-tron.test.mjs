import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MessageView } = await jiti.import("./MessageView.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const source = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");
const h = React.createElement;
const render = (message, props = {}) => renderToStaticMarkup(h(I18nProvider, null, h(MessageView, { message, ...props })));

test("user message is an orange chamfer that keeps its scroll cap", () => {
  const html = render({ role: "user", content: "hello", timestamp: Date.now() });
  assert.match(html, /tron-chamfer/);
  assert.match(html, /bg-tron-orange/);
  assert.match(html, /max-height:300px/);
  assert.match(html, /overflow-y:auto/);
});

test("editing a user message turns the chamfer glow on", () => {
  assert.match(source, /<Chamfer tone="orange" glow=\{isEditing\}/);
});

test("assistant reply has the cyan trace, a HUD model label and a cursor while streaming", () => {
  const message = { role: "assistant", provider: "anthropic", model: "claude-test", content: [{ type: "text", text: "hi" }] };
  const idle = render(message);
  assert.match(idle, /border-tron-cyan/);
  assert.match(idle, /font-hud/);
  assert.doesNotMatch(idle, /tron-cursor/);
  assert.match(render(message, { isStreaming: true }), /tron-cursor/);
});

test("no off-palette colors remain in MessageView", () => {
  assert.doesNotMatch(source, /#16a34a|#f87171|#ef4444|#ca8a04|#53b3cb|#9bc53d|#f9c22e|#e01a4f|rgba\((34,197,94|248,113,113|239,68,68|234,179,8|59,130,246|96,165,250)/);
});

const statusBlock = { type: "toolCall", toolCallId: "call-tron-1", toolName: "read", input: { path: "/tmp/a" } };
const statusMessage = { role: "assistant", provider: "anthropic", model: "claude-test", content: [statusBlock] };
const result = (isError) => ({ role: "toolResult", toolCallId: statusBlock.toolCallId, toolName: "read", content: [{ type: "text", text: isError ? "ENOENT" : "ok" }], isError });

test("tool cards expose their status and draw it in Tron colors", () => {
  const running = render(statusMessage, { toolResults: new Map(), runningToolIds: new Set([statusBlock.toolCallId]), runActive: true });
  assert.match(running, /data-card-state="running"/);
  assert.match(running, /tron-scan/);
  assert.match(running, /shadow-glow-orange/);
  const failed = render(statusMessage, { toolResults: new Map([[statusBlock.toolCallId, result(true)]]) });
  assert.match(failed, /data-card-state="failed"/);
  assert.match(failed, /border-tron-red/);
  const done = render(statusMessage, { toolResults: new Map([[statusBlock.toolCallId, result(false)]]) });
  assert.match(done, /data-card-state="done"/);
  assert.match(done, /data-status="done"/); // the Led
  assert.match(done, /text-tron-cyan/); // the tool name
});

test("code mode statuses use Tron colors", async () => {
  const codemode = await readFile(new URL("./CodemodeToolView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(codemode, /#d97706|#16a34a|#f87171|rgba\(/);
});
