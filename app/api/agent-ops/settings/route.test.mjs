import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-agentops-settings-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { PUT } = await jiti.import("./route.ts");

const put = (body) => PUT(new Request("http://localhost/api/agent-ops/settings", {
  method: "PUT",
  headers: { host: "localhost", "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
}));

test("a malformed body answers 400, not 500", async () => {
  const res = await put("{ nope");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid JSON body" });
});
test("an unknown field answers 400", async () => {
  assert.equal((await put({ nope: 1 })).status, 400);
});
test("a valid patch answers 200 with the merged settings", async () => {
  const res = await put({ paused: true });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).settings.paused, true);
});
