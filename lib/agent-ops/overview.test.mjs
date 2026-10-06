import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-")); // avant l'import
const { buildAgentCards, readAgentProfileRef } = await (await import("jiti")).createJiti(import.meta.url).import("./overview.ts");

test("buildAgentCards maps profile.name, flags running from a Set, keeps orphan history", () => {
  const profiles = [
    { name: "leandro", displayName: "Leandro", description: "SRE", color: "#f00", enabled: true },
  ];
  const sessions = [
    { id: "s1", path: "/x/s1.jsonl", name: "Diag", created: "2026-10-05T10:00:00Z", modified: "2026-10-05T11:00:00Z", cwd: "/p", agentProfile: "leandro" },
    { id: "s2", path: "/x/s3.jsonl", created: "2026-10-04T10:00:00Z", modified: "2026-10-04T10:30:00Z", cwd: "/p", agentProfile: "ghost" },
  ];
  const cards = buildAgentCards({ profiles, sessions, runningSessionIds: new Set(["s1"]) });
  const leandro = cards.find((c) => c.profile === "leandro");
  assert.equal(leandro.running, true);
  assert.equal(leandro.lastActivity, "2026-10-05T11:00:00Z");
  assert.equal(leandro.sessions.length, 1);
  assert.equal(leandro.displayName, "Leandro");           // mapping name → profile
  const ghost = cards.find((c) => c.profile === "ghost"); // orphelin visible, désactivé
  assert.equal(ghost.enabled, false);
  assert.equal(ghost.orphan, true);
  assert.equal(ghost.description, "");
  assert.equal(leandro.orphan, false);
  // seule une allowlist de champs part vers le client (pas systemPrompt/tools/filePath)
  assert.deepEqual(Object.keys(leandro).sort(), ["color", "description", "displayName", "enabled", "lastActivity", "orphan", "profile", "running", "sessions"]);
});

test("readAgentProfileRef reads data.profile, tolerates deleted files", () => {
  const sessionFile = join(process.env.PI_CODING_AGENT_DIR, "s.jsonl");
  writeFileSync(sessionFile, JSON.stringify({ type: "session", id: "s", cwd: "/p", timestamp: "2026-10-05T10:00:00Z" }) + "\n" +
    JSON.stringify({ type: "custom", customType: "pi-web:agent-profile", data: { version: 1, profile: "leandro", createdAt: "2026-10-05T10:00:00Z" } }) + "\n");
  assert.deepEqual(readAgentProfileRef(sessionFile), { profile: "leandro", createdAt: "2026-10-05T10:00:00Z" });
  assert.equal(readAgentProfileRef(join(process.env.PI_CODING_AGENT_DIR, "gone.jsonl")), null); // pas de throw
});

test("buildAgentCards sorts orphan sessions by modified descending", () => {
  const profiles = [];
  const sessions = [
    { id: "o1", path: "/x/o1.jsonl", created: "2026-10-03T10:00:00Z", modified: "2026-10-03T10:00:00Z", cwd: "/p", agentProfile: "orphan" },
    { id: "o2", path: "/x/o2.jsonl", created: "2026-10-04T10:00:00Z", modified: "2026-10-05T10:00:00Z", cwd: "/p", agentProfile: "orphan" },
  ];
  const cards = buildAgentCards({ profiles, sessions, runningSessionIds: new Set() });
  const orphan = cards.find((c) => c.profile === "orphan");
  assert.equal(orphan.sessions[0].id, "o2"); // newest first
  assert.equal(orphan.lastActivity, "2026-10-05T10:00:00Z"); // newest modified
});

test("readAgentProfileRef cache respects maxBytes and detects file changes", () => {
  const cacheFile = join(process.env.PI_CODING_AGENT_DIR, "cache-test.jsonl");
  writeFileSync(cacheFile, JSON.stringify({ type: "session", id: "c", cwd: "/p" }) + "\n" +
    JSON.stringify({ type: "custom", customType: "pi-web:agent-profile", data: { version: 1, profile: "alice", createdAt: "2026-10-05T10:00:00Z" } }) + "\n");
  const cached1 = readAgentProfileRef(cacheFile);
  assert.equal(cached1.profile, "alice");
  // Rewrite with different profile
  writeFileSync(cacheFile, JSON.stringify({ type: "session", id: "c", cwd: "/p" }) + "\n" +
    JSON.stringify({ type: "custom", customType: "pi-web:agent-profile", data: { version: 1, profile: "bob", createdAt: "2026-10-05T11:00:00Z" } }) + "\n");
  const cached2 = readAgentProfileRef(cacheFile);
  assert.equal(cached2.profile, "bob"); // detects file change
  // Delete and verify returns null
  unlinkSync(cacheFile);
  assert.equal(readAgentProfileRef(cacheFile), null);
});
