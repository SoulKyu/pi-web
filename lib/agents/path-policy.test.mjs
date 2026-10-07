import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-path-policy-"));
const { homePathBlockReason, pathOfToolInput, createHomePathPolicyExtension } = await (await import("jiti")).createJiti(import.meta.url).import("./path-policy.ts");

const root = mkdtempSync(join(tmpdir(), "pi-web-home-"));
const home = join(root, "home"); const outside = join(root, "outside");
mkdirSync(home); mkdirSync(outside);
writeFileSync(join(home, "notes.md"), "ok"); writeFileSync(join(outside, "id_ed25519"), "secret");
symlinkSync(join(outside, "id_ed25519"), join(home, "link"));
symlinkSync(outside, join(home, "dir-link"));
symlinkSync(outside, join(home, "x y"));

test("paths inside the home pass, relative paths resolve against the home", () => {
  assert.equal(homePathBlockReason("read", join(home, "notes.md"), home), null);
  assert.equal(homePathBlockReason("ls", ".", home), null);
  assert.equal(homePathBlockReason("grep", "notes.md", home), null);
});
test("paths outside, symlinks to outside and .. escapes are blocked (Review Focus 1)", () => {
  for (const path of [join(outside, "id_ed25519"), join(home, "link"), join(home, "dir-link", "id_ed25519"), join(home, "..", "outside", "id_ed25519"), "/etc/passwd"]) {
    assert.match(homePathBlockReason("read", path, home) ?? "", /outside the agent home/, path);
  }
});
test("only the file tools are checked; the hook blocks with a reason", () => {
  assert.equal(pathOfToolInput("bash", { command: "ls /" }), undefined);
  assert.equal(pathOfToolInput("read", { path: "a" }), "a");
  let handler;
  createHomePathPolicyExtension(home).factory({ on: (name, fn) => { if (name === "tool_call") handler = fn; }, registerTool: () => {} });
  assert.deepEqual(handler({ toolName: "read", input: { path: "/etc/passwd" } }, {}), { block: true, reason: homePathBlockReason("read", "/etc/passwd", home) });
  assert.equal(handler({ toolName: "read", input: { path: join(home, "notes.md") } }, {}), undefined);
});

test("paths pi would rewrite are blocked (~, @, file://, Unicode spaces)", () => {
  for (const path of ["~", "~/.ssh", "@~", "@" + join(outside, "id_ed25519"), "file:///", "file://" + join(outside, "id_ed25519"), "FILE:///", join(home, "x\u00a0y")]) {
    for (const tool of ["read", "grep", "find", "ls"]) assert.match(homePathBlockReason(tool, path, home) ?? "", /blocked/, path);
  }
});
test("find patterns may not leave the home", () => {
  let handler;
  createHomePathPolicyExtension(home).factory({ on: (name, fn) => { if (name === "tool_call") handler = fn; }, registerTool: () => {} });
  for (const pattern of ["../**", "/etc/*", "a/../../b"]) {
    assert.match(handler({ toolName: "find", input: { path: home, pattern } }, {}).reason, /pattern may not leave/, pattern);
  }
  assert.equal(handler({ toolName: "find", input: { path: home, pattern: "**/*.md" } }, {}), undefined);
});
