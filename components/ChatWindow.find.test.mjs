import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the magnifier sits in the floating cluster before scroll-to-latest and toggles the bar", () => {
  const cluster = source.slice(source.indexOf("{!isEmptyNew && ("), source.indexOf("className={`chat-scroll-to-bottom"));
  assert.match(cluster, /className="chat-find-toggle"/);
  assert.match(cluster, /aria-expanded=\{findOpen\}/);
  assert.match(cluster, /aria-label=\{t\("chat\.find\.open"\)\}/);
});

test("the bar is in flow above the composer, with a 16px input on phones", () => {
  const bar = source.indexOf('id="chat-find-bar"');
  assert.ok(bar > 0 && source.indexOf("{chatInputElement}", bar) > bar);
  assert.match(source, /role="search"/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.chat-find-input \{ font-size: 16px; \}/);
});

test("Enter / Shift+Enter step (never mid-IME), Escape closes from the bar container, no Ctrl+F binding", () => {
  const bar = source.slice(source.indexOf('id="chat-find-bar"'), source.indexOf("{chatInputElement}"));
  const containerEsc = bar.indexOf('onKeyDown={(event) => {\n            if (event.key !== "Escape" || event.nativeEvent.isComposing || event.keyCode === 229) return;\n            event.preventDefault();\n            closeFind();');
  assert.ok(containerEsc > 0 && containerEsc < bar.indexOf("<input"));
  assert.doesNotMatch(bar.slice(bar.indexOf("<input")), /key === "Escape"/);
  assert.match(source, /if \(event\.key !== "Enter" \|\| event\.nativeEvent\.isComposing \|\| event\.keyCode === 229\) return;/);
  assert.match(source, /stepFind\(event\.shiftKey \? -1 : 1\)/);
  assert.doesNotMatch(source, /key === "f"/i);
});

test("the active hit resets when the scan source changes", () => {
  assert.match(source, /useEffect\(\(\) => \{\n\s+setFindIndex\(-1\);\n\s+\}, \[findSource\]\);/);
});

test("the scan waits while a run streams, and a jump goes through AppShell's search target", () => {
  assert.match(source, /const findSourceStale = findSourceRef\.current\.messages !== messages \|\| findSourceRef\.current\.entryIds !== entryIds;/);
  assert.match(source, /const findQueryChanged = findSourceRef\.current\.query !== findQuery \|\| findSourceRef\.current\.open !== findOpen;/);
  assert.match(source, /if \(findSourceStale && \(!\(sessionBusy \|\| streamState\.isStreaming\) \|\| findQueryChanged\)\)/);
  assert.match(source, /aria-controls=\{findOpen \? "chat-find-bar" : undefined\}/);
  assert.match(source, /findInMessages\(findSource\.messages, findSource\.entryIds, findQuery\)/);
  assert.match(source, /onRequestSearchTarget\?\.\(\{ sessionId: session\.id, \.\.\.hit \}\)/);
  assert.match(shell, /onRequestSearchTarget=\{setSearchTarget\}/);
});

test("switching session closes the bar and forgets the query", () => {
  assert.match(source, /useEffect\(\(\) => \{\n\s+setFindOpen\(false\);\n\s+setFindQuery\(""\);\n\s+setFindIndex\(-1\);\n\s+\}, \[session\?\.id\]\);/);
});

test("find strings exist in all four locales", async () => {
  for (const locale of ["en", "fr", "zh-CN", "zh-TW"]) {
    const messages = await readFile(new URL(`../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8");
    for (const key of ["chat.find.open", "chat.find.placeholder", "chat.find.previous", "chat.find.next", "chat.find.close", "chat.find.count", "chat.find.loadedOnly"]) {
      assert.ok(messages.includes(`"${key}"`), `${locale} ${key}`);
    }
  }
});
