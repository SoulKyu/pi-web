import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { HexAvatar, PerspectiveGrid, ScanBar, StreamCursor, Chamfer } = await jiti.import("./index.tsx");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

test("HexAvatar shows up to two uppercase initials, emoji-safe", () => {
  assert.match(html(h(HexAvatar, { label: "ops" })), />OP</);
  assert.match(html(h(HexAvatar, { label: "  review " })), />RE</);
  assert.match(html(h(HexAvatar, { label: "🤖bot" })), />🤖B</);
  assert.match(html(h(HexAvatar, { label: "" })), />\?</);
});

test("decorative pieces are hidden from assistive tech", () => {
  for (const el of [h(PerspectiveGrid), h(ScanBar), h(StreamCursor), h(HexAvatar, { label: "pi" })]) {
    assert.match(html(el), /^<span[^>]*aria-hidden="true"|^<div[^>]*aria-hidden="true"/);
  }
});

test("Chamfer draws a tone border layer and puts the glow on an outer wrapper", () => {
  const out = html(h(Chamfer, { tone: "orange", glow: true, cut: 10 }, "x"));
  assert.match(out, /drop-shadow/);
  assert.match(out, /--cut:10px/);
  assert.match(out, /--cut:9px/);
  assert.match(out, /bg-tron-orange/);
});

test("scan bar and cursor stop under reduced motion", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.tron-scan,\s*\.tron-cursor \{\s*animation: none;/);
});
