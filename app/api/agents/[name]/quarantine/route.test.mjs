import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-quarantineroute-")); // before the imports
process.env.PI_MEM0_DIR = mkdtempSync(join(tmpdir(), "pi-web-quarantinemem0-"));
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { POST } = await jiti.import("./route.ts");
const reg = await jiti.import("../../../../../lib/agents/registry.ts");
const settings = await jiti.import("../../../../../lib/agent-ops/settings.ts");
reg.createLongTermAgent({ name: "Lea", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } });
const ctx = (name) => ({ params: Promise.resolve({ name }) });
const post = (name) => POST(new Request("http://localhost/x", { method: "POST" }), ctx(name));

test("unknown agent -> 404", async () => {
  assert.equal((await post("Nobody")).status, 404);
});

test("200 no-store: the agent is paused afterwards, idempotent on a second call", async () => {
  const first = await post("Lea");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Cache-Control"), "no-store");
  const body = await first.json();
  assert.deepEqual({ ...body, trash: null, snapshot: null }, { trash: null, snapshot: null, secrets: [], vaultSecrets: [], staged: 0, tasksAborted: 0, tasksCancelled: 0, errors: [] });
  assert.match(body.snapshot, /agent-spaces\/\.trash\/Lea-quarantine-[^/]+\/home-snapshot$/);
  assert.deepEqual(settings.readAgentOpsSettings().pausedAgents, ["Lea"]);
  assert.equal((await post("Lea")).status, 200);
  assert.deepEqual(settings.readAgentOpsSettings().pausedAgents, ["Lea"]);
});
