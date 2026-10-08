import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
const models = await read("./ModelsConfig.tsx");
const profile = await read("./agents/AgentProfileDialog.tsx");
const globals = await read("../app/globals.css");
const settings = await read("../app/settings.css");
const tabs = await read("./TabBar.tsx");

test("text on red buttons is dark; thinking levels use Tron-family hues", () => {
  assert.doesNotMatch(models, /background: "var\(--color-tron-red\)",\s*color: "#fff"/);
  assert.doesNotMatch(profile, /background: "var\(--color-tron-red\)", color: "#fff"/);
  assert.doesNotMatch(models, /#6b7280|#a78bfa|#f472b6|#fb923c/);
});

test("agent notices and events use Tron colors; no dead duplicate login-error rule", () => {
  assert.doesNotMatch(globals, /#f5a524|#8e7cc3|rgba\(245,\s*165,\s*36|rgba\(142,\s*124,\s*195/);
  assert.doesNotMatch(globals, /html\.dark \.web-login-error/);
});

test("the switch knob is square like its track", () => {
  const knob = settings.slice(settings.indexOf("\n.config-switch-knob {"), settings.indexOf("}", settings.indexOf("\n.config-switch-knob {")));
  assert.match(knob, /border-radius: 0;/);
});

test("the active tab uses the text token and keeps its trace while focused", () => {
  assert.doesNotMatch(tabs, /bg-bg text-white/);
  assert.match(tabs, /focus-visible:shadow-\[inset_0_-2px_0_var\(--color-tron-cyan\),var\(--shadow-glow-cyan\)\]/);
});
