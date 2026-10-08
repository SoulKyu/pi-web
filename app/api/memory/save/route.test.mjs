import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = mkdtempSync(path.join(os.tmpdir(), "pi-web-memory-save-"));
const memDir = mkdtempSync(path.join(os.tmpdir(), "pi-web-memory-save-mem0-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_MEM0_DIR = memDir;
test.after(async () => { await rm(agentDir, { recursive: true, force: true }); await rm(memDir, { recursive: true, force: true }); });

mkdirSync(path.join(memDir, "scopes"), { recursive: true });
writeFileSync(path.join(memDir, "scopes", "project-abc.json"), JSON.stringify({ scope: "project-abc", memories: [{ id: "m1", text: "t", createdAt: "c", source: "auto" }] }));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { POST } = await jiti.import("./route.ts");
const post = (body, headers = {}) => POST(new Request("http://localhost/api/memory/save", {
  method: "POST",
  headers: { host: "localhost", origin: "http://localhost", "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
}));
const queued = () => { try { return readdirSync(path.join(memDir, "save")); } catch { return []; } };

test("promote: queues a save request and answers 202 with its id, no-store", async () => {
  const res = await post({ scope: "user", text: " likes tea " });
  assert.equal(res.status, 202);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const { requestId } = await res.json();
  const file = path.join(memDir, "save", `${requestId}.json`);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { scope: "user", text: "likes tea", source: "pi-web" });
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("correct: replaces must exist in the scope's snapshot", async () => {
  const res = await post({ scope: "project:abc", text: "fixed", replaces: "m1" });
  assert.equal(res.status, 202);
  const { requestId } = await res.json();
  assert.deepEqual(JSON.parse(readFileSync(path.join(memDir, "save", `${requestId}.json`), "utf8")), { scope: "project:abc", text: "fixed", replaces: "m1", source: "pi-web" });
  const before = queued().length;
  assert.equal((await post({ scope: "project:abc", text: "x", replaces: "ghost" })).status, 404);
  assert.equal((await post({ scope: "user", text: "x", replaces: "m1" })).status, 404);
  assert.equal((await post({ scope: "project:abc", text: "x", replaces: "../x" })).status, 404);
  assert.equal(queued().length, before);
});

test("bad scope, empty, too long, [REDACTED], non-string replaces answer 400 and queue nothing", async () => {
  const before = queued().length;
  for (const body of [
    { scope: "project:../x", text: "a" }, { scope: "user" }, { scope: "user", text: "  " },
    { scope: "user", text: "x".repeat(4097) }, { scope: "user", text: "a [REDACTED] b" },
    { scope: "user", text: "a", replaces: 5 },
  ]) assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 50));
  assert.equal(queued().length, before);
});

test("malformed JSON, wrong content type and a cross-site request are refused", async () => {
  assert.equal((await post("{ nope")).status, 400);
  assert.equal((await post({ scope: "user", text: "a" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post({ scope: "user", text: "a" }, { origin: "http://evil.example" })).status, 403);
});
