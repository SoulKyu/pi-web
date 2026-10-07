import assert from "node:assert/strict";
import test from "node:test";
const { promptChipsOf } = await (await import("jiti")).createJiti(import.meta.url).import("./prompt-chips.ts");

test("keeps .md files only, without extension, sorted", () => {
  const entries = [
    { name: "b.md", isDir: false },
    { name: "a.md", isDir: false },
    { name: "notes.txt", isDir: false },
    { name: "dir.md", isDir: true },
    { name: "c.MD", isDir: false },
  ];
  assert.deepEqual(promptChipsOf(entries), ["a", "b"]);
});

test("caps at 12", () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({ name: `p${String(i).padStart(2, "0")}.md`, isDir: false }));
  assert.equal(promptChipsOf(entries).length, 12);
});
