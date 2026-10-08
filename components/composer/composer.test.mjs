import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ComposerChip } = await jiti.import("./ComposerChip.tsx");
const input = await readFile(new URL("../ChatInput.tsx", import.meta.url), "utf8");
const h = React.createElement;

test("ComposerChip: typed button, hover only when enabled, danger and active tones", () => {
  const idle = renderToStaticMarkup(h(ComposerChip, null, "x"));
  assert.match(idle, /^<button[^>]*type="button"/);
  assert.match(idle, /enabled:hover:text-text/);
  assert.doesNotMatch(idle, /(^|\s|")hover:/);
  assert.match(renderToStaticMarkup(h(ComposerChip, { tone: "danger" }, "x")), /text-tron-red/);
  assert.match(renderToStaticMarkup(h(ComposerChip, { active: true }, "x")), /bg-bg-hover/);
});

test("the control bar has no JS hover handlers", () => {
  const start = input.indexOf("{/* Bottom bar: left | center (context) | right */}");
  const bar = input.slice(start, input.indexOf("</fieldset>", start));
  assert.doesNotMatch(bar, /onMouseEnter|onMouseLeave/);
  assert.match(bar, /<ComposerChip/);
});

test("composer menus share the Tron menu class", () => {
  assert.ok((input.match(/composerMenuClass/g) ?? []).length >= 4, "import + thinking, tools, history");
});

const { ChatInput } = await jiti.import("../ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const renderInput = (props = {}) => renderToStaticMarkup(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false, ...props })));

test("the dock is a cyan chamfer, orange while steering is possible, plain in compact mode", () => {
  const idle = renderInput();
  assert.match(idle, /tron-chamfer/);
  assert.match(idle, /bg-tron-cyan/);
  const steering = renderInput({ isStreaming: true, onSteer() {}, onFollowUp() {} });
  assert.match(steering, /tron-chamfer p-px bg-tron-orange/);
  assert.match(input, /compact \? \(/); // compact keeps the plain shell branch
});

test("send is orange only with content; disabled send has no hover change", () => {
  assert.match(input, /hasDraft \? "bg-tron-orange text-black enabled:hover:shadow-glow-orange" : "bg-bg-panel text-text-dim"/);
});

test("the chamfer wraps only the textarea row, menus stay outside it", () => {
  const shell = input.slice(input.indexOf("<Chamfer"), input.indexOf("</Chamfer>"));
  assert.ok(shell.length > 0);
  assert.doesNotMatch(shell, /historyMenuRef|thinkingDropdownOpen &&|toolDropdownOpen &&/);
});

test("no off-palette colors remain in the composer and selectors", async () => {
  for (const file of ["../ChatInput.tsx", "../ModelSelector.tsx", "../SelectorRow.tsx", "../AgentProfileSelector.tsx"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(src, /#ef4444|rgba\((239,68,68|234,179,8|180,130,0|129,140,248|99,102,241|16,185,129|5,150,105|59,130,246|37,99,235)/, file);
    assert.doesNotMatch(src, /rgba\(\$\{color\}/, file);
  }
});

test("the mobile controls panel does not clip the dropdowns opening above it", () => {
  assert.doesNotMatch(input, /className=\{isMobile \? composerMenuClass : undefined\}/);
  assert.match(input, /className=\{isMobile \? "border border-tron-line bg-black shadow-glow-cyan" : undefined\}/);
});

test("an active accent chip stays cyan; active only adds the hover background", () => {
  const out = renderToStaticMarkup(h(ComposerChip, { active: true, tone: "accent" }, "x"));
  assert.match(out, /(^|\s|")text-tron-cyan(\s|")/);
  assert.doesNotMatch(out, /(\s|")text-text(\s|")/);
  assert.match(out, /bg-bg-hover/);
});
