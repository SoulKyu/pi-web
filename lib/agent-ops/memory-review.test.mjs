import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const review = await (await import("jiti")).createJiti(import.meta.url).import("./memory-review.ts");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const D = "abcdefab-abcd-4bcd-8bcd-abcdefabcdef";
const C = "33333333-3333-4333-8333-333333333333";

function stagingDir() {
  const dir = join(mkdtempSync(join(tmpdir(), "memreview-")), "staging");
  mkdirSync(dir);
  return dir;
}
function stage(dir, id, createdAt, extra = {}) {
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, agent: "leandro", text: `fact ${id.slice(0, 2)}`, sourceSession: "s1", createdAt, ...extra }));
}

test("mem0StagingDir honours PI_MEM0_DIR", () => {
  process.env.PI_MEM0_DIR = "/tmp/mem0-root";
  try {
    assert.equal(review.mem0StagingDir(), "/tmp/mem0-root/staging");
  } finally {
    delete process.env.PI_MEM0_DIR;
  }
  assert.match(review.mem0StagingDir(), /mem0[\\/]staging$/);
});

test("listStagedFacts lists only valid facts, oldest first, with decision state", () => {
  const dir = stagingDir();
  stage(dir, B, "2026-01-02T00:00:00.000Z");
  stage(dir, A, "2026-01-01T00:00:00.000Z");
  stage(dir, C, "2026-01-03T00:00:00.000Z");
  writeFileSync(join(dir, `${A}.decision.json`), '{"approved":true}');
  writeFileSync(join(dir, `${B}.decision.json`), '{"approved":false}');
  writeFileSync(join(dir, `${C}.processing`), '{"approved":true}');
  writeFileSync(join(dir, `${A}.json.tmp`), "{}");
  writeFileSync(join(dir, "not-a-uuid.json"), "{}");
  writeFileSync(join(dir, "44444444-4444-4444-8444-444444444444.json"), "{not json");
  stage(dir, "55555555-5555-4555-8555-555555555555", "2026-01-04T00:00:00.000Z", { text: 42 });
  const facts = review.listStagedFacts(dir);
  assert.deepEqual(facts.map((f) => [f.id, f.decision]), [[A, "approved"], [B, "rejected"], [C, "applying"]]);
  assert.deepEqual(Object.keys(facts[0]).sort(), ["agent", "createdAt", "decision", "id", "sourceSession", "text"]);
});

test("listStagedFacts: undecided fact has null decision; missing dir gives []", () => {
  const dir = stagingDir();
  stage(dir, A, "2026-01-01T00:00:00.000Z");
  assert.equal(review.listStagedFacts(dir)[0].decision, null);
  assert.deepEqual(review.listStagedFacts(join(dir, "nope")), []);
});

test("writeDecision writes the exact JSON and overwrites a previous decision", () => {
  const dir = stagingDir();
  stage(dir, A, "2026-01-01T00:00:00.000Z");
  review.writeDecision(A, true, dir);
  assert.equal(readFileSync(join(dir, `${A}.decision.json`), "utf8"), '{"approved":true}');
  review.writeDecision(A, false, dir);
  assert.equal(readFileSync(join(dir, `${A}.decision.json`), "utf8"), '{"approved":false}');
  assert.equal(review.listStagedFacts(dir)[0].decision, "rejected");
});

test("writeDecision refuses non-UUID, unknown, malformed and applying facts", () => {
  const dir = stagingDir();
  stage(dir, A, "2026-01-01T00:00:00.000Z");
  writeFileSync(join(dir, `${A}.processing`), '{"approved":true}');
  writeFileSync(join(dir, `${B}.json`), "{not json");
  stage(dir, D, "2026-01-01T00:00:00.000Z");
  const code = (id) => { try { review.writeDecision(id, true, dir); } catch (e) { return e.code; } return null; };
  assert.equal(code("../etc/passwd"), "not_found");
  assert.equal(code(D.toUpperCase()), "not_found");
  assert.equal(code(C), "not_found");
  assert.equal(code(B), "not_found");
  assert.equal(code(A), "conflict");
});
