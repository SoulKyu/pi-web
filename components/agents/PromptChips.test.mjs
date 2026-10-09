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

test("the + chip uploads .md files into <home>/prompts, never overwriting, then lists them again", () => {
  const source = readFileSync(new URL("./PromptChips.tsx", import.meta.url), "utf8");
  assert.match(source, /<input ref=\{uploadInputRef\} type="file" accept="\.md,text\/markdown" multiple hidden onChange=\{handleUpload\} \/>/);
  assert.match(source, /onClick=\{\(\) => uploadInputRef\.current\?\.click\(\)\}/);
  assert.match(source, /uploadFiles\(dir, files, "skip"\)/);
  assert.match(source, /\.filter\(\(file\) => file\.name\.toLowerCase\(\)\.endsWith\("\.md"\)\)/);
  assert.match(source, /setReloadKey\(\(key\) => key \+ 1\)/);
  assert.match(source, /onNotice\?\.\(t\("agents\.prompts\.uploadFailed"/);
});

test("the agent detail route makes sure the prompts folder exists", () => {
  const route = readFileSync(new URL("../../app/api/agents/[name]/route.ts", import.meta.url), "utf8");
  assert.match(route, /ensurePromptsDir\(agent\.home\);\s*return NextResponse\.json\(\{ agent: toAgentDetail/);
});

test("ChatWindow wires the chips' upload notices", () => {
  const chat = readFileSync(new URL("../ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(chat, /<PromptChips home=\{session\.cwd\} chatInputRef=\{chatInputRef\} onNotice=\{\(message\) => addNotice\(\{ type: "error", message \}\)\} \/>/);
});

test("reads only below the home and never polls", () => {
  const source = readFileSync(new URL("./PromptChips.tsx", import.meta.url), "utf8");
  assert.match(source, /joinFilePath\(home, "prompts"\)/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /\(\?<[=!]/);
});

test("the role field of both dialogs carries the folded help", () => {
  for (const file of ["NewAgentDialog.tsx", "AgentProfileForm.tsx"]) {
    assert.match(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"), /<details[^>]*>[\s\S]*agents\.new\.roleHelp/, file);
  }
});
