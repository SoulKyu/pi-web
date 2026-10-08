import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AgentAvatar } = await jiti.import("./AgentAvatar.tsx");
const rail = await readFile(new URL("./AgentRail.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const h = React.createElement;
const avatar = { emoji: "🤖", color: "#7c3aed" };

test("AgentAvatar is a hex in the agent's color, cyan when selected, emoji intact", () => {
  const idle = renderToStaticMarkup(h(AgentAvatar, { avatar }));
  assert.match(idle, /tron-hex/);
  assert.match(idle, /background:#7c3aed/);
  assert.match(idle, />🤖</);
  const selected = renderToStaticMarkup(h(AgentAvatar, { avatar, selected: true }));
  assert.match(selected, /bg-tron-cyan|var\(--color-tron-cyan\)/);
});

test("rail dots and badge use Tron colors: running orange, needs-input orange pulse, failed red, unread cyan", () => {
  const rule = (sel) => {
    const start = css.indexOf(`\n${sel} {`);
    assert.ok(start >= 0, sel);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.match(rule(".agent-running-dot"), /var\(--color-tron-orange\)/);
  assert.match(rule(".agent-dot-needs-input"), /var\(--color-tron-orange\)/);
  assert.match(rule(".agent-dot-failed"), /var\(--color-tron-red\)/);
  assert.match(rule(".agent-badge"), /var\(--color-tron-cyan\)/);
  assert.doesNotMatch(css, /#30a46c|#d29922|#f85149|#e5484d/);
});

test("rail buttons use lucide icons, not emoji glyphs, and health levels map to Tron colors", () => {
  for (const glyph of ["📥", "⧉", "☰", "⏸", "▶", "🌙", "⚠"]) assert.ok(!rail.includes(glyph), glyph);
  assert.match(rail, /from "lucide-react"/);
  assert.match(rail, /ok: "var\(--color-tron-cyan\)", warn: "var\(--color-tron-orange\)", down: "var\(--color-tron-red\)"/);
});
