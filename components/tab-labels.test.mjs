import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { tabLabelSuffixes } = await jiti.import("./tab-labels.ts");
const tabBar = await readFile(new URL("./TabBar.tsx", import.meta.url), "utf8");
const locales = await Promise.all(["en", "fr", "zh-CN", "zh-TW"].map(async (id) => Object.values(await jiti.import(`../lib/i18n/messages/${id}.ts`)).find((value) => value?.messages)));

const fileTab = (filePath) => ({ id: `file:${filePath}`, label: filePath.split(/[\\/]/).pop(), filePath });
const hints = (tabs) => Object.fromEntries(tabLabelSuffixes(tabs));

test("unique labels get no hint", () => {
  assert.deepEqual(hints([fileTab("/r/a/index.ts"), fileTab("/r/a/main.ts")]), {});
});

test("one differing parent folder is enough", () => {
  assert.deepEqual(hints([fileTab("/r/a/index.ts"), fileTab("/r/b/index.ts")]), {
    "file:/r/a/index.ts": "a",
    "file:/r/b/index.ts": "b",
  });
});

test("each tab gets its own shortest distinguishing suffix", () => {
  assert.deepEqual(hints([fileTab("/r/a/src/index.ts"), fileTab("/r/b/src/index.ts"), fileTab("/r/c/lib/index.ts")]), {
    "file:/r/a/src/index.ts": "a/src",
    "file:/r/b/src/index.ts": "b/src",
    "file:/r/c/lib/index.ts": "lib",
  });
});

test("past two folders the hint is capped and prefixed with …/", () => {
  assert.deepEqual(hints([fileTab("/x/one/a/src/i.ts"), fileTab("/x/two/a/src/i.ts")]), {
    "file:/x/one/a/src/i.ts": "…/a/src",
    "file:/x/two/a/src/i.ts": "…/a/src",
  });
});

test("terminal tabs and non-closable pseudo-tabs are skipped", () => {
  const tabs = [
    fileTab("/r/a/index.ts"),
    { id: "terminal:1", label: "index.ts", filePath: "/r/b/index.ts", kind: "terminal" },
    { id: "agent", label: "index.ts", filePath: "/r/c/index.ts", closable: false },
  ];
  assert.deepEqual(hints(tabs), {});
});

test("Windows paths split on backslashes", () => {
  assert.deepEqual(hints([fileTab("C:\\r\\a\\index.ts"), fileTab("C:\\r\\b\\index.ts")]), {
    "file:C:\\r\\a\\index.ts": "a",
    "file:C:\\r\\b\\index.ts": "b",
  });
});

test("a file at the root gets no hint, its namesake still does", () => {
  assert.deepEqual(hints([fileTab("/index.ts"), fileTab("/r/index.ts")]), { "file:/r/index.ts": "r" });
});

test("TabBar renders the hint dimmed, after the name, inside the tab's accessible name", () => {
  assert.match(tabBar, /const suffixes = useMemo\(\(\) => tabLabelSuffixes\(tabs\), \[tabs\]\);/);
  assert.match(tabBar, /suffix \? t\("files\.tabWithDir", \{ name: tab\.label, dir: suffix \}\) : tab\.label/);
  assert.match(tabBar, /\{tab\.label\}\s*<\/span>\s*\{suffix && \(\s*<span\s+aria-hidden="true"/);
  assert.match(tabBar, /flex: "1 1000 auto",[\s\S]*?color: "var\(--text-dim\)"/);
  assert.match(tabBar, /flex: suffix \? "0 1 auto" : 1,\s*minWidth: 0,/);
});

test("TabBar scrolls the active tab into view, smoothly only without reduced motion", () => {
  assert.match(tabBar, /<div\s+ref=\{listRef\}\s+role="tablist"/);
  assert.match(tabBar, /querySelector<HTMLElement>\('\[role="tab"\]\[aria-selected="true"\]'\)/);
  assert.match(tabBar, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(tabBar, /scrollIntoView\(\{ block: "nearest", inline: "nearest", behavior: reduceMotion \? "auto" : "smooth" \}\)/);
  assert.match(tabBar, /\}, \[activeTabId\]\);/);
});

test("files.tabWithDir exists in the four locales with {name} and {dir}", () => {
  for (const locale of locales) {
    const text = locale.messages["files.tabWithDir"];
    assert.equal(typeof text, "string", locale.id);
    assert.match(text, /\{name\}/, locale.id);
    assert.match(text, /\{dir\}/, locale.id);
  }
});
