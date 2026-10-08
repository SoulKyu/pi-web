import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const dir = mkdtempSync(join(tmpdir(), "pi-web-secrets-"));
process.env.PI_CODING_AGENT_DIR = dir; // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { moduleCache: false });
const { listSecretNames, setSecret, deleteSecret, readSecrets } = await jiti.import("./secrets.ts");
const { createSecretRedactionExtension } = await jiti.import("./secret-redaction.ts");

test("round trip: set, replace, list names, read, delete; modes 0700/0600", () => {
  assert.deepEqual(readSecrets("lea"), {});
  setSecret("lea", "API_KEY", "abc=def");
  setSecret("lea", "TOKEN", "t1");
  setSecret("lea", "TOKEN", "t2");
  assert.deepEqual(listSecretNames("lea"), ["API_KEY", "TOKEN"]);
  assert.deepEqual(readSecrets("lea"), { API_KEY: "abc=def", TOKEN: "t2" });
  assert.equal(statSync(join(dir, "agents-secrets")).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, "agents-secrets", "lea.env")).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(dir, "agents-secrets", "lea.env"), "utf8"), "API_KEY=abc=def\nTOKEN=t2\n");
  deleteSecret("lea", "TOKEN");
  assert.deepEqual(listSecretNames("lea"), ["API_KEY"]);
  assert.throws(() => deleteSecret("lea", "TOKEN"), { status: 404 });
  assert.deepEqual(listSecretNames("other"), []);
});

test("invalid and reserved names, bad values, bad agent name are refused without echoing the value", () => {
  for (const name of ["lower", "1A", "A-B", "", "A".repeat(65), "PATH", "HOME", "BASH_ENV", "IFS", "PI_WEB_PASSWORD", "NODE_OPTIONS", "LD_PRELOAD", "DYLD_X", "PWD", "LANG", "GIT_SSH_COMMAND", "LC_ALL", "BASH_FUNC_x", "SSH_AUTH_SOCK"]) {
    assert.throws(() => setSecret("lea", name, "value"), { status: 400 }, name);
  }
  for (const value of ["", "a\nb", "a\rb", "x".repeat(4097)]) {
    assert.throws(() => setSecret("lea", "OK_NAME", value), (e) => e.status === 400 && !e.message.includes("a\nb"));
  }
  assert.throws(() => setSecret("../x", "OK_NAME", "v"), { status: 400 });
});

test("at most 50 secrets per agent; replacing at the cap still works", () => {
  for (let i = 0; i < 50; i += 1) setSecret("cap", `S${i}`, "v");
  assert.throws(() => setSecret("cap", "EXTRA", "v"), { status: 400 });
  setSecret("cap", "S0", "w");
  assert.equal(listSecretNames("cap").length, 50);
});

test("redaction: exact values, longest first, short untouched, structuredContent kept, non-text kept", () => {
  let handler;
  createSecretRedactionExtension({ LONG: "supersecret-1234", PART: "supersecret", SHORT: "abc" }).factory({ on: (_e, h) => { handler = h; } });
  const image = { type: "image", data: "supersecret" };
  const out = handler({ content: [{ type: "text", text: "a supersecret-1234 b supersecret c abc" }, image], structuredContent: { k: "supersecret" } });
  assert.equal(out.content[0].text, "a [SECRET:LONG] b [SECRET:PART] c abc");
  assert.equal(out.content[1], image);
  assert.deepEqual(out.structuredContent, { k: "supersecret" });
  assert.equal(handler({ content: null }), undefined);
});

test("readSecrets skips invalid, reserved and prototype-named lines", async () => {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(dir, "agents-secrets"), { recursive: true });
  writeFileSync(join(dir, "agents-secrets", "bad.env"), "__proto__=x\nconstructor=y\nPATH=/evil\nGIT_DIR=z\nGOOD=ok\nnoequals\n");
  const secrets = readSecrets("bad");
  assert.deepEqual(secrets, { GOOD: "ok" });
  assert.equal(Object.getPrototypeOf(secrets), Object.prototype);
});
