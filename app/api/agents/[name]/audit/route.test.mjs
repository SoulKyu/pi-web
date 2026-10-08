import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-auditroute-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { GET } = await jiti.import("./route.ts");
const reg = await jiti.import("../../../../../lib/agents/registry.ts");
const { appendAudit } = await jiti.import("../../../../../lib/agents/audit.ts");
reg.createLongTermAgent({ name: "Lea", role: "r", toolsPreset: "read-only", avatar: { emoji: "x", color: "#aaaaaa" } });
const get = (name, query = "") => GET(new Request(`http://localhost/x${query}`), { params: Promise.resolve({ name }) });

test("unknown agent -> 404", async () => {
  assert.equal((await get("Nobody")).status, 404);
});

test("known agent -> lines, no-store, limit honoured", async () => {
  for (let i = 0; i < 3; i++) appendAudit("Lea", { at: new Date().toISOString(), tool: `t${i}`, args: "{}", isError: false, nested: false });
  const response = await get("Lea", "?limit=2");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await response.json()).lines.map((l) => l.tool), ["t1", "t2"]);
});
