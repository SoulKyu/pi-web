import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("targets Safari and iOS 16.4 or newer", () => {
  assert.ok(pkg.browserslist.includes("safari 16.4"), "safari 16.4");
  assert.ok(pkg.browserslist.includes("ios_saf 16.4"), "ios_saf 16.4");
  assert.ok(!pkg.browserslist.some((entry) => /\b16\.[0-3]\b/.test(entry)), "no 16.0-16.3 entry");
});
