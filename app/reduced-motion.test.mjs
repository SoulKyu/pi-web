import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
const componentsDir = new URL("../components/", import.meta.url);
const sources = await Promise.all(
  (await readdir(componentsDir, { recursive: true }))
    .filter((name) => name.endsWith(".tsx"))
    .map(async (name) => [name, await readFile(new URL(name, componentsDir), "utf8")]),
);

const marker = "/* Reduced motion: shared keyframes";
const start = css.indexOf(marker);
const rule = start >= 0 ? css.slice(start, css.indexOf("\n}\n", start) + 3) : "";

test("one reduced-motion rule stops the shared keyframes, whatever order the style attribute is serialised in", () => {
  assert.ok(start >= 0, "rule exists");
  assert.match(rule, /@media \(prefers-reduced-motion: reduce\) \{/);
  for (const name of ["spin", "pulse", "blink"]) {
    assert.ok(rule.includes(`[style*="animation"][style*="${name}"]`), `inline ${name}`);
    assert.ok(rule.includes(`[class*="animate-[${name}"]`), `Tailwind arbitrary ${name}`);
  }
  assert.ok(rule.includes(".animate-spin"));
  assert.ok(rule.includes(".animate-pulse"));
  assert.ok(rule.includes(".agent-dot-needs-input"));
  assert.match(rule, /animation: none !important;/);
});

test("every component spin/pulse/blink animation is one the rule covers", () => {
  const inline = /animation: "(\w+) /g;
  const arbitrary = /animate-\[(\w+)_/g;
  const named = /\banimate-(spin|pulse|bounce|ping)\b/g;
  for (const [name, source] of sources) {
    for (const [, keyframe] of source.matchAll(inline)) {
      if (["spin", "pulse", "blink"].includes(keyframe)) assert.ok(rule.includes(`[style*="${keyframe}"]`), `${name}: inline ${keyframe}`);
    }
    for (const [, keyframe] of source.matchAll(arbitrary)) {
      if (["spin", "pulse", "blink"].includes(keyframe)) assert.ok(rule.includes(`[class*="animate-[${keyframe}"]`), `${name}: animate-[${keyframe}`);
    }
    for (const [match] of source.matchAll(named)) {
      assert.ok(rule.includes(`.${match}`), `${name}: ${match}`);
    }
  }
});
