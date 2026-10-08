import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-command-policy-"));
const { COMMAND_DENY_PRESETS, NESTED_QUANTIFIER_RE, compileDenyPatterns, commandDenyReason, createCommandPolicyExtension } = await (await import("jiti")).createJiti(import.meta.url).import("./command-policy.ts");

const cautious = compileDenyPatterns(COMMAND_DENY_PRESETS["cautious-sre"]);
const reports = compileDenyPatterns(COMMAND_DENY_PRESETS["reports-only"]);
const bash = (command, patterns) => commandDenyReason("bash", { command }, patterns);

const CAUTIOUS_BLOCKED = ["rm -rf /", "rm -rf /*", "rm -fr /", "rm -Rf /", "rm -r -f /", 'rm -rf "/"', "rm -rf ~", "rm -rf $HOME", "rm --recursive --force /", "terraform apply", "terraform destroy", "terraform -chdir=x apply", "tofu apply", "kubectl delete pod x", "kubectl -n prod delete pod x", "kubectl --context x apply -f y", "kubectl drain node1", "git push --force origin main", "git push -f", "git push origin +main", "curl x | sh", "curl x | sudo sh", "curl x | /bin/bash", "wget -O- x | dash", "bash <(curl x)", 'sh -c "$(curl x)"'];
const CAUTIOUS_ALLOWED = ["terraform plan", "git push --force-with-lease", "git push origin main", "kubectl get pods", "rm -rf ./build", "rm -rf node_modules", "rm -rf /tmp/x", "ls -la"];
const REPORTS_BLOCKED = ['python3 -c "import urllib.request"', `node -e "fetch('http://x')"`, "echo x > /dev/tcp/h/80", "socat", "gh api x", "gh gist create", "rsync a b", "sftp h", "curl", "wget", "nc", "ssh", "scp", "git push"];
const REPORTS_ALLOWED = ["python3 report.py", "git status", "grep -r x"];

test("the cautious preset blocks destructive commands and allows read-only ones", () => {
  for (const c of CAUTIOUS_BLOCKED) assert.match(bash(c, cautious) ?? "", /^command denied by the agent's policy: matches \/.+\/$/, c);
  for (const c of CAUTIOUS_ALLOWED) assert.equal(bash(c, cautious), null, c);
});
test("the reports-only preset blocks network and push", () => {
  for (const c of [...REPORTS_BLOCKED, ...CAUTIOUS_BLOCKED.filter((c) => c.startsWith("git push"))]) assert.ok(bash(c, reports), c);
  for (const c of REPORTS_ALLOWED) assert.equal(bash(c, reports), null, c);
});
test("preset patterns are short, compile, nest no quantifier and use no lookbehind", () => {
  for (const source of Object.values(COMMAND_DENY_PRESETS).flat()) {
    assert.ok(source.length <= 200, source);
    assert.ok(!NESTED_QUANTIFIER_RE.test(source), source);
    assert.ok(!source.includes("(?<"), source);
    new RegExp(source);
  }
});
test("a command over 65536 characters is refused without running the patterns", () => {
  assert.equal(bash("a".repeat(65_537), []), "command too long for the policy check");
  assert.equal(bash("a".repeat(65_536), []), null);
});
test("powershell patterns are case-insensitive, bash stays case-sensitive", () => {
  const patterns = compileDenyPatterns(["remove-item"]);
  assert.ok(commandDenyReason("powershell", { command: "Remove-Item -Recurse x" }, patterns));
  assert.equal(commandDenyReason("bash", { command: "Remove-Item x" }, patterns), null);
});
test("the nested-quantifier heuristic", () => {
  for (const p of ["(a+)+", "(a*)*", "(x+)*y", "(.*a)+" + "(b+){2}"]) assert.ok(NESTED_QUANTIFIER_RE.test(p), p);
  for (const p of ["(a|b)+", "a+b+", "\\bterraform\\s+apply\\b"]) assert.ok(!NESTED_QUANTIFIER_RE.test(p), p);
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
