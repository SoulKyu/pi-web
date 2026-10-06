import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-reader-events-"));
const { buildSessionContext } = await (await import("jiti")).createJiti(import.meta.url).import("./session-reader.ts");

test("a pi-web:agent-event custom entry renders as a card and counts toward the tail; other custom entries do not", () => {
  const entries = [
    { type: "custom", id: "c0", parentId: null, customType: "pi-web:agent-profile", data: { version: 1, profile: "a" } },
    { type: "message", id: "u1", parentId: "c0", message: { role: "user", content: "hi" } },
    { type: "custom", id: "e1", parentId: "u1", customType: "pi-web:agent-event", data: { version: 1, kind: "schedule", taskId: "t1", triggerId: "g1", title: "night check" } },
    { type: "message", id: "u2", parentId: "e1", message: { role: "user", content: "check" } },
    { type: "custom", id: "e2", parentId: "u2", customType: "pi-web:agent-event", data: { version: 1, kind: "junk" } },
  ];
  const context = buildSessionContext(entries, undefined, { tail: 2 });
  assert.deepEqual(context.entryIds, ["e1", "u2"]);
  assert.equal(context.messages[0].role, "custom");
  assert.equal(context.messages[0].customType, "agent-event");
  assert.equal(context.messages[0].details.taskId, "t1");
  const all = buildSessionContext(entries, undefined, {});
  assert.deepEqual(all.entryIds, ["u1", "e1", "u2"]);
});

test("listAllSessions reports the agent profile and its trust from the prefix entries", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { listAllSessions, invalidateSessionListCache } = await (await import("jiti")).createJiti(import.meta.url).import("./session-reader.ts");
  const dir = join(process.env.PI_CODING_AGENT_DIR, "sessions", "--tmp-agent-trust--");
  mkdirSync(dir, { recursive: true });
  const write = (id, extra) => writeFileSync(join(dir, `2026-01-01T00-00-00-000Z_${id}.jsonl`), [
    { type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd: "/tmp" },
    ...extra,
    { type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "hi", timestamp: 1 } },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n");
  const profile = (trust) => ({ type: "custom", id: "p0", parentId: null, timestamp: "2026-01-01T00:00:00.500Z", customType: "pi-web:agent-profile", data: { version: 1, profile: "leandro", trust } });
  write("run-untrusted", [profile("untrusted")]);
  write("run-trusted", [profile("trusted")]);
  write("plain", []);
  invalidateSessionListCache();
  const byId = new Map((await listAllSessions({ force: true })).map((s) => [s.id, s]));
  assert.deepEqual(byId.get("run-untrusted").agentProfile, { name: "leandro", trust: "untrusted" });
  assert.deepEqual(byId.get("run-trusted").agentProfile, { name: "leandro", trust: "trusted" });
  assert.equal("agentProfile" in byId.get("plain"), false);
});
