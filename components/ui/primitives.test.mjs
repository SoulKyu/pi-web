import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { cn } = await jiti.import("@/lib/cn");
const { Button } = await jiti.import("./button.tsx");
const { Input } = await jiti.import("./input.tsx");
const { Led } = await jiti.import("./led.tsx");
const { Gauge } = await jiti.import("./gauge.tsx");
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

test("cn lets the later Tailwind class win", () => {
  assert.equal(cn("px-2 text-sm", false && "hidden", "px-4"), "text-sm px-4");
});

test("Button is type=button by default and reaches 44px on coarse pointers", () => {
  const out = html(h(Button, null, "Go"));
  assert.match(out, /^<button[^>]*type="button"/);
  assert.match(out, /pointer-coarse:h-11/);
  assert.match(html(h(Button, { size: "icon", "aria-label": "Add" }, "+")), /pointer-coarse:size-11/);
});

test("Button asChild renders the child element and no button type", () => {
  const out = html(h(Button, { asChild: true }, h("a", { href: "/x" }, "Link")));
  assert.match(out, /^<a [^>]*href="\/x"/);
  assert.doesNotMatch(out, /type="button"/);
});

test("Input marks invalid fields in red", () => {
  assert.match(html(h(Input, { "aria-invalid": true })), /aria-invalid:border-tron-red/);
});

test("Led is decorative without a label and an image with one", () => {
  assert.match(html(h(Led, { status: "idle" })), /aria-hidden="true"/);
  const labelled = html(h(Led, { status: "running", label: "Running" }));
  assert.match(labelled, /role="img"/);
  assert.match(labelled, /aria-label="Running"/);
  assert.match(labelled, /data-status="running"/);
});

test("Gauge clamps out-of-range and non-numeric values", () => {
  for (const [input, expected] of [[-5, "0"], [150, "100"], [Number.NaN, "0"], [Number.POSITIVE_INFINITY, "0"], [42.4, "42"]]) {
    const out = html(h(Gauge, { value: input, label: "Context" }));
    assert.match(out, new RegExp(`aria-valuenow="${expected}"`), String(input));
    assert.match(out, /role="meter"/);
  }
});

test("Gauge turns orange from 75% and red from 90%", () => {
  assert.match(html(h(Gauge, { value: 50, label: "c" })), /var\(--color-tron-cyan\) 0 50%/);
  assert.match(html(h(Gauge, { value: 80, label: "c" })), /var\(--color-tron-orange\) 0 80%/);
  assert.match(html(h(Gauge, { value: 95, label: "c" })), /var\(--color-tron-red\) 0 95%/);
});
