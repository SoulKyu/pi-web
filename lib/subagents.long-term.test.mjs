import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-long-term-")); // before the import
const sub = await (await import("jiti")).createJiti(import.meta.url).import("./subagents.ts");

const base = { displayName: "Leandro", description: "SRE", systemPrompt: "You are Leandro.", tools: ["read", "bash", "edit", "write"], loadSkills: true, loadExtensions: true, inheritContext: false, runInBackground: false, promptMode: "append", enabled: true };

test("long_term round-trips through save and parse, and is absent for ordinary profiles", () => {
  const saved = sub.saveSubagentProfile(process.env.PI_CODING_AGENT_DIR, "global", { ...base, name: "leandro", longTerm: true });
  assert.equal(saved.longTerm, true);
  assert.match(readFileSync(saved.filePath, "utf8"), /^long_term: true$/m);
  const listed = sub.listSubagentProfiles(process.env.PI_CODING_AGENT_DIR).find((p) => p.name === "leandro");
  assert.equal(listed.longTerm, true);
  const plain = sub.saveSubagentProfile(process.env.PI_CODING_AGENT_DIR, "global", { ...base, name: "helper" });
  assert.equal(plain.longTerm, undefined);
  assert.doesNotMatch(readFileSync(plain.filePath, "utf8"), /long_term/);
});

const profileEntry = (data) => ({ type: "custom", customType: "pi-web:agent-profile", id: "x", data });
const snapshot = (tools) => ({ version: 1, appendSystemPrompt: ["role"], tools, loadSkills: true, loadExtensions: true });

test("readSessionAgentTrust: trusted only when the newest entry says so; absent is untrusted", () => {
  assert.equal(sub.readSessionAgentTrust([]), "untrusted");
  assert.equal(sub.readSessionAgentTrust([profileEntry({ version: 1, profile: "a", resourceSnapshot: snapshot(["read"]) })]), "untrusted");
  assert.equal(sub.readSessionAgentTrust([profileEntry({ version: 1, profile: "a", trust: "trusted", resourceSnapshot: snapshot(["read"]) })]), "trusted");
  assert.equal(sub.readSessionAgentTrust([profileEntry({ version: 1, profile: "a", trust: "bogus", resourceSnapshot: snapshot(["read"]) })]), "untrusted");
});

test("a newest version-1 entry with a non-string profile is untrusted, never an older entry", () => {
  const entries = [
    profileEntry({ version: 1, profile: "a", trust: "trusted", resourceSnapshot: snapshot(["read"]) }),
    profileEntry({ version: 1, profile: 42, trust: "trusted", resourceSnapshot: snapshot(["read"]) }),
  ];
  assert.equal(sub.readSessionAgentProfile(entries), undefined);
  assert.equal(sub.readSessionAgentTrust(entries), "untrusted");
});

test("the newest pi-web:agent-profile entry wins for the resource snapshot", () => {
  const entries = [
    profileEntry({ version: 1, profile: "a", resourceSnapshot: snapshot(["read"]) }),
    { type: "message", id: "m1", message: { role: "user", content: "hi" } },
    profileEntry({ version: 1, profile: "a", trust: "trusted", resourceSnapshot: snapshot(["read", "bash"]) }),
  ];
  assert.deepEqual(sub.readSubagentSessionResources(entries).tools, ["read", "bash"]);
  assert.equal(sub.readSessionAgentProfile(entries), "a");
});

test("sameResourceSnapshot ignores tool order and compares prompts and flags", () => {
  const a = { appendSystemPrompt: ["r"], tools: ["read", "bash"], loadSkills: true, loadExtensions: true };
  assert.equal(sub.sameResourceSnapshot(a, { ...a, tools: ["bash", "read"] }), true);
  assert.equal(sub.sameResourceSnapshot(a, { ...a, tools: ["read"] }), false);
  assert.equal(sub.sameResourceSnapshot(a, { ...a, appendSystemPrompt: ["other"] }), false);
  assert.equal(sub.sameResourceSnapshot(a, { ...a, exactSystemPrompt: "x" }), false);
});
