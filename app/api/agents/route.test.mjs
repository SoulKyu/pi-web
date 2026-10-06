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
  assert.match(one, /invalidateSessionPathCache\(/);
});
test("the sessions list leaves agent homes out, and long-term agents are never delegable", async () => {
  assert.match(await read("../sessions/route.ts"), /isAgentHomePath\(/);
  assert.match(await read("../agent-ops/overview/route.ts"), /\(p\.scope === "builtin" \|\| p\.scope === "global"\) && !p\.longTerm/);
  assert.match(await read("../subagents/profiles/route.ts"), /filter\(\(profile\) => !profile\.longTerm\)/);
  assert.match(await read("../../../lib/subagent-runtime.ts"), /if \(profile\.longTerm\) throw new Error/);
  assert.match(await read("../../../lib/rpc-manager.ts"), /listSubagentProfiles\(sessionCwd\)\.filter\(\(profile\) => !profile\.longTerm\)/);
});
