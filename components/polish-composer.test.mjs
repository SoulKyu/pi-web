import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const input = await read("./ChatInput.tsx");
const chat = await read("./ChatWindow.tsx");
const message = await read("./MessageView.tsx");
const branches = await read("./BranchNavigator.tsx");

test("slash and @ menus are Tron menus: square, hairline, glow; the active @ row has a trace", () => {
  for (const ref of ["slashMenuRef", "atMenuRef"]) {
    const block = input.slice(input.indexOf(`ref={${ref}}`), input.indexOf("overflow: \"hidden\"", input.indexOf(`ref={${ref}}`)));
    assert.match(block, /border: "1px solid var\(--color-tron-line\)"/, ref);
    assert.match(block, /borderRadius: 0/, ref);
    assert.match(block, /boxShadow: "var\(--shadow-glow-cyan\)"/, ref);
  }
  assert.match(input, /boxShadow: active \? "inset 2px 0 0 var\(--color-tron-cyan\)" : "none"/);
});

test("shell mode (!) is visible on the dock", () => {
  assert.match(input, /<Chamfer tone=\{steering \|\| bashMode \? "orange" : "cyan"\}/);
  assert.match(input, /background: bashMode \? "color-mix\(in srgb, var\(--color-tron-orange\) 8%, #000\)" : "#000"/);
});

test("extension dialogs and panels are square with the glow", () => {
  assert.doesNotMatch(chat, /borderRadius: 8,/);
  assert.doesNotMatch(chat, /0 20px 60px rgba\(0,0,0,0\.28\)|0 12px 32px rgba\(0,0,0,0\.18\)/);
  assert.doesNotMatch(chat, /text-red-400/);
});

test("tool-card header focus is an inset ring (not clipped); the user branch chip is orange", () => {
  assert.match(message, /focus-visible:shadow-\[inset_0_0_0_1px_var\(--color-tron-cyan\)\]/);
  assert.match(branches, /color: role === "user" \? "var\(--color-tron-orange\)"/);
});
