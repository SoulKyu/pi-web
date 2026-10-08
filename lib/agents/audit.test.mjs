import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-audit-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { moduleCache: false });
const { appendAudit, readAudit, auditArgs, auditPaths, createAuditObserver, blockLine } = await jiti.import("./audit.ts");
const { createCommandPolicyExtension } = await jiti.import("./command-policy.ts");

const line = (at, tool = "read", extra = {}) => ({ at, tool, args: "{}", isError: false, nested: false, ...extra });

test("append/read round-trip, newest last, limit, modes", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-"));
  for (let i = 0; i < 5; i++) appendAudit("Lea", line(`2026-10-0${i + 1}T00:00:00.000Z`, `t${i}`), dir);
  assert.deepEqual(readAudit("Lea", { dir, now: new Date("2026-10-08T00:00:00Z") }).map((l) => l.tool), ["t0", "t1", "t2", "t3", "t4"]);
  assert.deepEqual(readAudit("Lea", { dir, limit: 2, now: new Date("2026-10-08T00:00:00Z") }).map((l) => l.tool), ["t3", "t4"]);
  assert.equal(statSync(join(dir, "Lea")).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, "Lea", "2026-10.jsonl")).mode & 0o777, 0o600);
});

test("month rotation: two files read, older months ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-"));
  appendAudit("a", line("2026-08-31T23:59:59.000Z", "old"), dir);
  appendAudit("a", line("2026-09-30T23:59:59.000Z", "prev"), dir);
  appendAudit("a", line("2026-10-01T00:00:00.000Z", "cur"), dir);
  assert.ok(readFileSync(join(dir, "a", "2026-09.jsonl"), "utf8").includes("prev"));
  assert.deepEqual(readAudit("a", { dir, now: new Date("2026-10-08T00:00:00Z") }).map((l) => l.tool), ["prev", "cur"]);
  appendAudit("a", line("2026-12-31T00:00:00.000Z", "dec"), dir);
  assert.deepEqual(readAudit("a", { dir, now: new Date("2027-01-02T00:00:00Z") }).map((l) => l.tool), ["dec"]);
});

test("broken line tolerated; bad names refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-"));
  appendAudit("a", line("2026-10-01T00:00:00.000Z", "ok"), dir);
  appendFileSync(join(dir, "a", "2026-10.jsonl"), "{broken\n");
  appendAudit("a", line("2026-10-02T00:00:00.000Z", "ok2"), dir);
  assert.deepEqual(readAudit("a", { dir, now: new Date("2026-10-08T00:00:00Z") }).map((l) => l.tool), ["ok", "ok2"]);
  assert.throws(() => appendAudit("../x", line("2026-10-01T00:00:00.000Z"), dir));
  assert.deepEqual(readAudit("../x", { dir }), []);
});

test("redaction and truncation of args, paths, shell command never scanned", () => {
  const out = auditArgs({ command: "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123'", token: "x".repeat(900) });
  assert.ok(!out.includes("abcdefghijklmnopqrstuvwxyz0123"));
  assert.ok(out.length <= 500);
  assert.deepEqual(auditPaths("read", { path: "/etc/passwd", n: 1, rel: "a" }), ["/etc/passwd"]);
  assert.equal(auditPaths("bash", { command: "/bin/ls" }), undefined);
});

test("vault values are scrubbed from args, raw and JSON-escaped, even under 8 characters", () => {
  const secrets = { PIN: "ab12c", MULTI: 'x"y\\z' };
  const out = auditArgs({ command: "echo ab12c", text: 'x"y\\z' }, secrets);
  assert.ok(!out.includes("ab12c"));
  assert.ok(!out.includes('x\\"y'));
  assert.ok(out.includes("[SECRET:PIN]") && out.includes("[SECRET:MULTI]"));
  assert.ok(!blockLine("deny", { toolName: "bash", input: { command: "echo ab12c" } }, secrets).args.includes("ab12c"));
  const dir = mkdtempSync(join(tmpdir(), "audit-"));
  const observe = createAuditObserver("Lea", dir, secrets);
  observe({ type: "tool_execution_start", toolCallId: "s1", toolName: "write", args: { path: "/tmp/f", content: "ab12c" } });
  observe({ type: "tool_execution_end", toolCallId: "s1", toolName: "write" });
  assert.ok(!JSON.stringify(readAudit("Lea", { dir })).includes("ab12c"));
});

test("observer journals start/end pairs, nested flag, no results", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-"));
  const observe = createAuditObserver("Lea", dir);
  observe({ type: "tool_execution_start", toolCallId: "c1", toolName: "read", args: { path: "/tmp/x" } });
  observe({ type: "tool_execution_end", toolCallId: "c1", toolName: "read", isError: false, result: "SECRET-RESULT" });
  observe({ type: "tool_execution_start", toolCallId: "c1/1", toolName: "bash", args: { command: "ls" }, parentToolCallId: "c1" });
  observe({ type: "tool_execution_end", toolCallId: "c1/1", toolName: "bash", isError: true, parentToolCallId: "c1" });
  const lines = readAudit("Lea", { dir });
  assert.equal(lines.length, 2);
  assert.deepEqual([lines[0].tool, lines[0].paths, lines[0].nested, lines[0].isError], ["read", ["/tmp/x"], false, false]);
  assert.deepEqual([lines[1].tool, lines[1].nested, lines[1].isError], ["bash", true, true]);
  assert.equal(typeof lines[0].durationMs, "number");
  assert.ok(!JSON.stringify(lines).includes("SECRET-RESULT"));
});

test("observer never throws on an invalid agent name", () => {
  const observe = createAuditObserver("../bad", tmpdir());
  observe({ type: "tool_execution_start", toolCallId: "c", toolName: "read", args: {} });
  observe({ type: "tool_execution_end", toolCallId: "c", toolName: "read" });
});

test("a command policy block reaches onBlock with policy deny", () => {
  const blocked = [];
  let handler;
  createCommandPolicyExtension(["\\brm\\b"], (policy, event) => blocked.push(blockLine(policy, event))).factory({ on: (_n, h) => { handler = h; } });
  assert.equal(handler({ toolName: "bash", input: { command: "ls" } }), undefined);
  assert.equal(handler({ toolName: "bash", input: { command: "rm -rf x" } }).block, true);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].policy, "deny");
  assert.equal(blocked[0].isError, true);
  assert.equal(blockLine("egress", { toolName: "t", input: {}, parentToolCallId: "p" }).nested, true);
});
