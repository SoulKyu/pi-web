import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { isNewDay } = await jiti.import("./day-separators.ts");

const at = (y, m, d, h) => new Date(y, m, d, h).getTime();

test("same local day gives no separator", () => {
  assert.equal(isNewDay(at(2024, 2, 4, 0), at(2024, 2, 4, 23), "en"), null);
});

test("a day change gives the weekday and day", () => {
  const label = isNewDay(at(2024, 2, 4, 23), at(2024, 2, 5, 1), "en");
  assert.match(label, /Tuesday/);
  assert.match(label, /5/);
});

test("a missing previous timestamp opens the page with a label", () => {
  assert.match(isNewDay(undefined, at(2024, 2, 5, 9), "en"), /Tuesday/);
});

test("a missing next timestamp gives no separator", () => {
  assert.equal(isNewDay(at(2024, 2, 5, 9), undefined, "en"), null);
});

test("the year shows only outside the current year", () => {
  const year = new Date().getFullYear();
  assert.match(isNewDay(undefined, at(2001, 2, 5, 9), "en"), /2001/);
  assert.doesNotMatch(isNewDay(undefined, at(year, 5, 15, 9), "en"), new RegExp(String(year)));
});
