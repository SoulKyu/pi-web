import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agents-memory-"));
const dir = mkdtempSync(join(tmpdir(), "pi-mem0-"));
process.env.PI_MEM0_DIR = dir;
const m = await (await import("jiti")).createJiti(import.meta.url).import("./memory.ts");

test("readMem0Health returns typed fields, undefined on absence or junk", () => {
  assert.equal(m.readMem0Health(), undefined);
  writeFileSync(join(dir, "health.json"), "{ nope");
  assert.equal(m.readMem0Health(), undefined);
  writeFileSync(join(dir, "health.json"), JSON.stringify({ watcherAt: "2026-10-07T10:00:00.000Z", lastRecallMs: 86, lastCaptureError: 3, lastCaptureAt: "x", pid: 1, extra: "y" }));
  assert.deepEqual(m.readMem0Health(), { watcherAt: "2026-10-07T10:00:00.000Z", lastRecallMs: 86, lastCaptureAt: "x" });
  writeFileSync(join(dir, "health.json"), "[1]");
  assert.equal(m.readMem0Health(), undefined);
});
