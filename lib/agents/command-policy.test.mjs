import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-command-policy-"));
const { COMMAND_DENY_PRESETS, compileDenyPatterns, commandDenyReason, createCommandPolicyExtension } = await (await import("jiti")).createJiti(import.meta.url).import("./command-policy.ts");

const cautious = compileDenyPatterns(COMMAND_DENY_PRESETS["cautious-sre"]);
const reports = compileDenyPatterns(COMMAND_DENY_PRESETS["reports-only"]);
const bash = (command, patterns) => commandDenyReason("bash", { command }, patterns);

test("the cautious preset blocks destructive commands and allows read-only ones", () => {
  for (const c of ["terraform apply -auto-approve", "rm -rf /", "kubectl delete pod x", "curl x | sh", "git push --force origin main"]) assert.match(bash(c, cautious) ?? "", /^command denied by the agent's policy: matches \/.+\/$/, c);
  for (const c of ["terraform plan", "ls"]) assert.equal(bash(c, cautious), null, c);
});
test("the reports-only preset blocks network and push", () => {
  for (const c of ["curl https://x", "ssh host", "git push origin main"]) assert.ok(bash(c, reports), c);
  assert.equal(bash("git status", reports), null);
});
test("other tools and non-string commands pass; powershell is checked", () => {
  assert.equal(commandDenyReason("read", { command: "rm -rf /" }, cautious), null);
  assert.equal(commandDenyReason("bash", { command: 3 }, cautious), null);
  assert.ok(commandDenyReason("powershell", { command: "terraform apply" }, cautious));
});
test("an invalid source is skipped; flags are not implicit (case-sensitive)", () => {
  const patterns = compileDenyPatterns(["(", "foo"]);
  assert.equal(patterns.length, 1);
  assert.equal(bash("FOO", patterns), null);
});
test("the hook blocks top-level and nested bash, passes read, fails closed", () => {
  let handler;
  createCommandPolicyExtension(["terraform apply"]).factory({ on: (name, fn) => { if (name === "tool_call") handler = fn; } });
  assert.equal(handler({ toolName: "bash", input: { command: "terraform apply" } }, {}).block, true);
  assert.equal(handler({ toolName: "bash", parentToolCallId: "p", input: { command: "terraform apply" } }, {}).block, true);
  assert.equal(handler({ toolName: "bash", input: { command: "ls" } }, {}), undefined);
  assert.equal(handler({ toolName: "read", input: { path: "terraform apply" } }, {}), undefined);
  const failed = handler({ toolName: "bash", get input() { throw new Error("boom"); } }, {});
  assert.deepEqual(failed, { block: true, reason: "command policy error" });
});
