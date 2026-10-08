import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-permroute-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { GET } = await jiti.import("./route.ts");
const reg = await jiti.import("../../../../../lib/agents/registry.ts");
reg.createLongTermAgent({ name: "Lea", role: "r", toolsPreset: "read-only", avatar: { emoji: "x", color: "#aaaaaa" } });
const get = (name) => GET(new Request("http://localhost/x"), { params: Promise.resolve({ name }) });

test("unknown agent -> 404", async () => {
  assert.equal((await get("Nobody")).status, 404);
});

test("known agent -> permissions, no-store, extension tools unknown without a live thread", async () => {
  const response = await get("Lea");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const { permissions } = await response.json();
  assert.deepEqual(permissions.tools, ["read", "grep", "find", "ls"]);
  assert.equal(permissions.extensionTools, "unknown-until-start");
  assert.deepEqual(permissions.trifecta, { privateData: true, untrustedContent: false, exfiltration: true });
});
