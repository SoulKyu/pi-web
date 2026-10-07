import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { PromptChips } = await jiti.import("./PromptChips.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

test("renders the + chip with the hint before anything is listed", () => {
  const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(PromptChips, { home: "/h/agent", chatInputRef: { current: null } })));
  assert.match(html, /<button/);
  assert.match(html, /title="Add \.md files under \/h\/agent\/prompts to get chips"/);
});

test("reads only below the home and never polls", () => {
  const source = readFileSync(new URL("./PromptChips.tsx", import.meta.url), "utf8");
  assert.match(source, /joinFilePath\(home, "prompts"\)/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /\(\?<[=!]/);
});

test("the role field of both dialogs carries the folded help", () => {
  for (const file of ["NewAgentDialog.tsx", "AgentProfileDialog.tsx"]) {
    assert.match(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"), /<details[^>]*>[\s\S]*agents\.new\.roleHelp/, file);
  }
});
