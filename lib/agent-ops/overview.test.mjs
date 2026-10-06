import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  // seule une allowlist de champs part vers le client (pas systemPrompt/tools/filePath)
  assert.deepEqual(Object.keys(leandro).sort(), ["color", "description", "displayName", "enabled", "lastActivity", "profile", "running", "sessions"]);
});

test("readAgentProfileRef reads data.profile, tolerates deleted files", () => {
  const sessionFile = join(process.env.PI_CODING_AGENT_DIR, "s.jsonl");
  writeFileSync(sessionFile, JSON.stringify({ type: "session", id: "s", cwd: "/p", timestamp: "2026-10-05T10:00:00Z" }) + "\n" +
    JSON.stringify({ type: "custom", customType: "pi-web:agent-profile", data: { version: 1, profile: "leandro", createdAt: "2026-10-05T10:00:00Z" } }) + "\n");
  assert.deepEqual(readAgentProfileRef(sessionFile), { profile: "leandro", createdAt: "2026-10-05T10:00:00Z" });
  assert.equal(readAgentProfileRef(join(process.env.PI_CODING_AGENT_DIR, "gone.jsonl")), null); // pas de throw
});
