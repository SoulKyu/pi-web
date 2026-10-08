import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { Tabs, TabsList, TabsTrigger, TabsContent } = await jiti.import("./tabs.tsx");
const { Switch } = await jiti.import("./switch.tsx");
const h = React.createElement;
const src = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

test("Tabs render only the active panel", () => {
  const out = renderToStaticMarkup(h(Tabs, { defaultValue: "a" },
    h(TabsList, null, h(TabsTrigger, { value: "a" }, "A"), h(TabsTrigger, { value: "b" }, "B")),
    h(TabsContent, { value: "a" }, "panel A"),
    h(TabsContent, { value: "b" }, "panel B")));
  assert.ok(out.includes("panel A"));
  assert.ok(!out.includes("panel B"));
  assert.match(out, /role="tablist"/);
});

test("Switch exposes role=switch with its checked state", () => {
  const out = renderToStaticMarkup(h(Switch, { checked: true, "aria-label": "Expand thinking" }));
  assert.match(out, /role="switch"/);
  assert.match(out, /aria-checked="true"/);
});

test("DialogContent requires a translated close label", async () => {
  const dialog = await src("dialog.tsx");
  assert.match(dialog, /closeLabel: string/);
  assert.match(dialog, /aria-label=\{closeLabel\}/);
});

test("every entering animation is disabled under reduced motion", async () => {
  for (const file of ["dialog.tsx", "dropdown-menu.tsx", "popover.tsx", "tooltip.tsx"]) {
    const source = await src(file);
    const animated = source.match(/animate-tron-(enter|fade)/g) ?? [];
    const guarded = source.match(/motion-reduce:animate-none/g) ?? [];
    assert.ok(animated.length > 0, `${file} animates`);
    assert.equal(guarded.length, animated.length, `${file}: each animate-tron-* has motion-reduce:animate-none`);
  }
});
