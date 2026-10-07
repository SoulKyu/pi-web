import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TurnWrittenFiles, clipPreview, isPreviewable } = await jiti.import("./TurnWrittenFiles.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(TurnWrittenFiles, props)),
  );
}

test("renders a button per file showing the basename and full path", () => {
  const html = render({
    files: [{ filePath: "/abs/out/report.html" }, { filePath: "/abs/out/data.json" }],
    onOpenFile() {},
  });
  assert.match(html, /<button/);
  assert.match(html, /report\.html/);
  assert.match(html, /data\.json/);
  assert.match(html, /title="\/abs\/out\/report\.html"/);
  assert.match(html, /title="\/abs\/out\/data\.json"/);
});

test("renders nothing when no files were written", () => {
  assert.equal(render({ files: [], onOpenFile() {} }), "");
});

test("clipPreview keeps the first 20 lines and 8 KB", () => {
  const lines = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n");
  assert.equal(clipPreview(lines).split("\n").length, 20);
  assert.equal(clipPreview("x".repeat(20000)).length, 8192);
});

test("isPreviewable needs a .md strictly under the root", () => {
  assert.equal(isPreviewable("/home/a/notes.md", "/home/a"), true);
  assert.equal(isPreviewable("/home/a/notes.txt", "/home/a"), false);
  assert.equal(isPreviewable("/home/ab/notes.md", "/home/a"), false);
  assert.equal(isPreviewable("/home/a/notes.md", undefined), false);
  assert.equal(isPreviewable("/home/a/../b/notes.md", "/home/a"), false);
});

test("a previewable markdown file gets a closed details; others do not", () => {
  const html = render({
    files: [{ filePath: "/home/a/notes.md" }, { filePath: "/home/a/x.json" }, { filePath: "/etc/y.md" }],
    previewRoot: "/home/a",
    onOpenFile() {},
  });
  assert.equal(html.match(/<details/g).length, 1);
  assert.doesNotMatch(html, /<details[^>]* open/);
});
