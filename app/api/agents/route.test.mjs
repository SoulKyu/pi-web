import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the agent routes validate through the registry and never answer with the role in lists", async () => {
  const list = await read("./route.ts");
  assert.match(list, /validateCreateInput\(/);
  assert.match(list, /toAgentListItem\(/);
  assert.match(list, /allowFileRoot\(/);
  assert.match(list, /"Cache-Control": "no-store"/);
});
test("PATCH and DELETE refuse while the thread runs, and profile edits reach the live thread", async () => {
  const one = await read("./[name]/route.ts");
  assert.match(one, /canEditProfile\(threadRunning\(/);
  assert.match(one, /type: "set_model"/);
  assert.match(one, /type: "set_thinking_level"/);
  assert.match(one, /shutdownWhenIdle\(\)/);
  assert.match(one, /deleteLongTermAgent\(/);
  assert.match(one, /withThreadLock\(name/);
  assert.match(one, /isRpcSessionStarting\(id\)/);
  assert.match(one, /re-read under the lock/);
  assert.match(one, /await live\.shutdown\(\)/);
  assert.match(one, /if \(busy\(\)\) return running\(\); \/\/ it came back meanwhile/);
  assert.match(one, /invalidateSessionPathCache\(/);
});
test("the sessions list leaves agent homes out, and long-term agents are never delegable", async () => {
  assert.match(await read("../sessions/route.ts"), /isAgentHomePath\(/);
  assert.match(await read("../subagents/profiles/route.ts"), /filter\(\(profile\) => !profile\.longTerm\)/);
  assert.match(await read("../../../lib/subagent-runtime.ts"), /if \(profile\.longTerm\) throw new Error/);
  assert.match(await read("../../../lib/rpc-manager.ts"), /listSubagentProfiles\(sessionCwd\)\.filter\(\(profile\) => !profile\.longTerm\)/);
});
test("a saved profile re-pins the agent's triggers and a delete removes them before the registry delete", async () => {
  const one = await read("./[name]/route.ts");
  assert.match(one, /updateLongTermAgent\([^\n]*\);\s*repinTriggersOfAgent\(agent\.name\)/);
  assert.match(one, /deleteTriggersOfAgent\(agent\.name\);[^\n]*\n\s*const trash = deleteLongTermAgent\(/);
  const triggers = await read("../agent-ops/triggers/route.ts");
  assert.match(triggers, /searchParams\.get\("agent"\)/);
  assert.match(triggers, /trigger\.profile === agent/);
});

test("an isolated (untrusted agent-profile) run refuses every command but the get_ queries", async () => {
  const route = await read("../agent/[id]/route.ts");
  assert.match(route, /readSessionAgentProfileInfo\(/);
  assert.match(route, /trust === "untrusted"/);
  assert.match(route, /isolated run is read-only/);
  assert.match(route, /status: 403/);
  assert.match(route, /startsWith\("get_"\)/);
  assert.ok(route.indexOf("isolated run is read-only") < route.indexOf("existing.send(body)"));
  assert.ok(route.indexOf("isolated run is read-only") < route.indexOf('body.type === "set_tools"'));
});
