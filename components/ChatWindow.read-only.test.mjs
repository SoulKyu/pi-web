import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("an isolated run replaces the composer with a read-only banner", () => {
  assert.match(source, /session\?\.agentProfile\?\.trust === "untrusted"/);
  assert.match(source, /t\("agents\.thread\.readOnly", \{ name: session\.agentProfile\.name \}\)/);
  assert.match(source, /className="agent-read-only" role="status"/);
});
