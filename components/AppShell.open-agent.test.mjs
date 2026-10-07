import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("openAgent shows agents.error when the thread cannot be opened", () => {
  const body = source.slice(source.indexOf("const openAgent = useCallback"), source.indexOf("agentMountOpenedRef.current ="));
  assert.match(body, /window\.alert\(translate\("agents\.error", \{ error:/);
});
