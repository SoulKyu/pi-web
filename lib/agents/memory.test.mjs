import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agents-memory-"));
const mem = await (await import("jiti")).createJiti(import.meta.url).import("./memory.ts");
const dir = mkdtempSync(join(tmpdir(), "pi-mem0-dir-"));
const MEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("readAgentMemorySnapshot reads the pi-mem0 file, tolerates absence and junk", () => {
  assert.deepEqual(mem.readAgentMemorySnapshot("leandro", dir), []);
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "leandro.json"), JSON.stringify({ agent: "leandro", updatedAt: "t", memories: [
    { id: MEM_ID, text: "prefers Helm", createdAt: "2026-01-01T00:00:00.000Z", source: "auto" },
    { id: 42, text: "bad" },
  ] }));
  assert.deepEqual(mem.readAgentMemorySnapshot("leandro", dir), [{ id: MEM_ID, text: "prefers Helm", createdAt: "2026-01-01T00:00:00.000Z", source: "auto" }]);
  writeFileSync(join(dir, "agents", "broken.json"), "{");
  assert.deepEqual(mem.readAgentMemorySnapshot("broken", dir), []);
  assert.deepEqual(mem.readAgentMemorySnapshot("../leandro", dir), []);
});

test("readAgentMemorySnapshot ignores an oversized file, an agent mismatch and caps at 200", () => {
  const item = (id) => ({ id: `m${id}`, text: "t", createdAt: "c", source: "auto" });
  writeFileSync(join(dir, "agents", "big.json"), JSON.stringify({ agent: "big", memories: [{ ...item(1), text: "x".repeat(1024 * 1024) }] }));
  assert.deepEqual(mem.readAgentMemorySnapshot("big", dir), []);
  writeFileSync(join(dir, "agents", "mismatch.json"), JSON.stringify({ agent: "leandro", memories: [item(1)] }));
  assert.deepEqual(mem.readAgentMemorySnapshot("mismatch", dir), []);
  writeFileSync(join(dir, "agents", "many.json"), JSON.stringify({ agent: "many", memories: Array.from({ length: 250 }, (_, i) => item(i)) }));
  assert.equal(mem.readAgentMemorySnapshot("many", dir).length, 200);
});

test("requestForget writes the contract file; listPendingForgets sees it until pi-mem0 consumes it", () => {
  const id = mem.requestForget("leandro", MEM_ID, dir);
  const files = readdirSync(join(dir, "forget"));
  assert.deepEqual(files, [`${id}.json`]);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const stat = statSync(join(dir, "forget", files[0]));
  assert.ok(stat.isFile());
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, "forget")).mode & 0o777, 0o700);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "forget", files[0]), "utf8")), { memoryId: MEM_ID, agent: "leandro" });
  assert.deepEqual(mem.listPendingForgets("leandro", dir), [MEM_ID]);
  assert.deepEqual(mem.listPendingForgets("other", dir), []);
  assert.throws(() => mem.requestForget("leandro", "../../etc/passwd", dir));
  assert.throws(() => mem.requestForget("../x", MEM_ID, dir));
});

test("requestForget refuses an id absent from the agent's snapshot", () => {
  assert.throws(() => mem.requestForget("leandro", "unknown-id", dir), /not found/);
  assert.throws(() => mem.requestForget("nosnapshot", MEM_ID, dir), /not found/);
  assert.equal(readdirSync(join(dir, "forget")).length, 1);
});

test("readMem0Health returns typed fields, undefined on absence or junk", () => {
  const health = mkdtempSync(join(tmpdir(), "pi-mem0-health-"));
  assert.equal(mem.readMem0Health(health), undefined);
  writeFileSync(join(health, "health.json"), "{ nope");
  assert.equal(mem.readMem0Health(health), undefined);
  writeFileSync(join(health, "health.json"), JSON.stringify({ watcherAt: "2026-10-07T10:00:00.000Z", lastRecallMs: 86, lastCaptureError: 3, lastCaptureAt: "x", pid: 1, extra: "y" }));
  assert.deepEqual(mem.readMem0Health(health), { watcherAt: "2026-10-07T10:00:00.000Z", lastRecallMs: 86, lastCaptureAt: "x" });
  writeFileSync(join(health, "health.json"), "[1]");
  assert.equal(mem.readMem0Health(health), undefined);
});

test("readAgentMemoryEvents parses journal events, skips junk, absent gives []", () => {
  assert.deepEqual(mem.readAgentMemoryEvents("nobody", dir), []);
  const ok = { at: "2026-01-01T00:00:00.000Z", kind: "add", id: "m1", text: "prefers Helm", source: "auto", scope: "agent", sessionId: "s-1" };
  const forgot = { at: "2026-01-02T00:00:00.000Z", kind: "forget", id: "m1", text: "", source: "pi-web", scope: "agent" };
  writeFileSync(join(dir, "agents", "journal.json"), JSON.stringify({ agent: "journal", memories: [], events: [ok, { ...ok, kind: "bogus" }, { ...ok, sessionId: 5 }, null, "x", { at: 1 }, forgot] }));
  assert.deepEqual(mem.readAgentMemoryEvents("journal", dir), [ok, forgot]);
  writeFileSync(join(dir, "agents", "noevents.json"), JSON.stringify({ agent: "noevents", memories: [] }));
  assert.deepEqual(mem.readAgentMemoryEvents("noevents", dir), []);
  writeFileSync(join(dir, "agents", "badevents.json"), JSON.stringify({ agent: "badevents", memories: [], events: "x" }));
  assert.deepEqual(mem.readAgentMemoryEvents("badevents", dir), []);
  assert.deepEqual(mem.readAgentMemoryEvents("../journal", dir), []);
});
