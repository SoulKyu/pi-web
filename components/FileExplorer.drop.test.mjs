import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const explorer = await readFile(new URL("./FileExplorer.tsx", import.meta.url), "utf8");
const hook = await readFile(new URL("../hooks/useDragDrop.ts", import.meta.url), "utf8");

test("FileExplorer root accepts dropped files and uploads them", () => {
  assert.match(explorer, /onDrop=\{handleDrop\}/);
  assert.match(explorer, /useDragDrop\(\s*handleFilesDropped,\s*\(item\) => item\.kind === "file"/);
  assert.match(explorer, /const handleFilesDropped = useCallback[\s\S]*?void prepareUpload\(files\)/);
  assert.match(explorer, /files\.dropToUpload/);
  assert.match(explorer, /files\.foldersNotSupported/);
});

test("useDragDrop defaults to images and skips directories", () => {
  assert.match(hook, /startsWith\("image\/"\)/);
  assert.match(hook, /isDirectory/);
});
