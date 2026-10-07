import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = mkdtempSync(path.join(os.tmpdir(), "pi-web-memory-route-"));
const memDir = mkdtempSync(path.join(os.tmpdir(), "pi-web-memory-route-mem0-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_MEM0_DIR = memDir;
test.after(async () => { await rm(agentDir, { recursive: true, force: true }); await rm(memDir, { recursive: true, force: true }); });

mkdirSync(path.join(memDir, "scopes"), { recursive: true });
writeFileSync(path.join(memDir, "scopes", "user.json"), JSON.stringify({ scope: "user", memories: [{ id: "u1", text: "prefers vim", createdAt: "2026-01-01T00:00:00.000Z", source: "memory_save" }] }));
writeFileSync(path.join(memDir, "scopes", "project-abc.json"), JSON.stringify({ scope: "project-abc", memories: [{ id: "p1", text: "uses pnpm", createdAt: "2026-01-02T00:00:00.000Z", source: "auto" }] }));
writeFileSync(path.join(memDir, "scopes", "index.json"), JSON.stringify({ projects: { abc: { label: "Alpha", cwd: "/w/alpha" } } }));
writeFileSync(path.join(memDir, "health.json"), JSON.stringify({ watcherAt: "2026-01-01T00:00:00.000Z" }));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { GET } = await jiti.import("./route.ts");
const get = (query) => GET(new Request(`http://localhost/api/memory${query}`, { headers: { host: "localhost" } }));

test("user scope answers items, the scope lists and the health, never cached", async () => {
  const res = await get("?scope=user");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = await res.json();
  assert.deepEqual(body.items.map((item) => item.id), ["u1"]);
  assert.deepEqual(body.scopes, { user: true, projects: [{ id: "abc", label: "Alpha" }], agents: [] });
  assert.equal(body.health.watcherAt, "2026-01-01T00:00:00.000Z");
});
test("a project scope reads its snapshot; no scope defaults to user", async () => {
  assert.deepEqual((await (await get("?scope=project:abc")).json()).items.map((item) => item.id), ["p1"]);
  assert.deepEqual((await (await get("")).json()).items.map((item) => item.id), ["u1"]);
});
test("a bad scope answers 400", async () => {
  for (const scope of ["project:../x", "everything", "project:", "agent:"]) assert.equal((await get(`?scope=${encodeURIComponent(scope)}`)).status, 400, scope);
});
