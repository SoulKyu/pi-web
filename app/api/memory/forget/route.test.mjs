import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = mkdtempSync(path.join(os.tmpdir(), "pi-web-memory-forget-"));
const memDir = mkdtempSync(path.join(os.tmpdir(), "pi-web-memory-forget-mem0-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_MEM0_DIR = memDir;
test.after(async () => { await rm(agentDir, { recursive: true, force: true }); await rm(memDir, { recursive: true, force: true }); });

const memories = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, text: "t", createdAt: "c", source: "auto" }));
mkdirSync(path.join(memDir, "scopes"), { recursive: true });
writeFileSync(path.join(memDir, "scopes", "user.json"), JSON.stringify({ scope: "user", memories }));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { POST } = await jiti.import("./route.ts");
const post = (body, headers = {}) => POST(new Request("http://localhost/api/memory/forget", {
  method: "POST",
  headers: { host: "localhost", "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
}));

test("queues one request file per id and answers 202 with the request ids", async () => {
  const res = await post({ scope: "user", memoryIds: ["m1", "m2"] });
  assert.equal(res.status, 202);
  const { requestIds } = await res.json();
  assert.equal(requestIds.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(path.join(memDir, "forget", `${requestIds[0]}.json`), "utf8")), { memoryId: "m1", scope: "user" });
});
test("more than 50 ids, none, a bad scope or a non-string id answer 400 and queue nothing", async () => {
  const before = readdirSync(path.join(memDir, "forget")).length;
  assert.equal((await post({ scope: "user", memoryIds: memories.slice(0, 51).map((m) => m.id) })).status, 400);
  assert.equal((await post({ scope: "user", memoryIds: [] })).status, 400);
  assert.equal((await post({ scope: "project:../x", memoryIds: ["m1"] })).status, 400);
  assert.equal((await post({ scope: "user", memoryIds: [1] })).status, 400);
  assert.equal((await post({ scope: "user", memoryIds: ["m1", "ghost"] })).status, 404);
  assert.equal(readdirSync(path.join(memDir, "forget")).length, before);
});
test("exactly 50 ids pass; malformed JSON, wrong content type and a cross-site request are refused", async () => {
  assert.equal((await post({ scope: "user", memoryIds: memories.slice(0, 50).map((m) => m.id) })).status, 202);
  assert.equal((await post("{ nope")).status, 400);
  assert.equal((await post({ scope: "user", memoryIds: ["m1"] }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post({ scope: "user", memoryIds: ["m1"] }, { origin: "http://evil.example" })).status, 403);
});
