import assert from "node:assert/strict";
import { test } from "node:test";
const { REDACTED, redactSecrets, truncate } = await (await import("jiti")).createJiti(import.meta.url).import("./redact.ts");

const alnum = (n) => "a1B2c3D4e5".repeat(Math.ceil(n / 10)).slice(0, n);
const families = {
  "private key": "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
  ghp_: `ghp_${alnum(36)}`,
  github_pat_: `github_pat_${alnum(40)}`,
  "glpat-": `glpat-${alnum(20)}`,
  "sk-": `sk-${alnum(32)}`,
  "sk-ant-": `sk-ant-${alnum(32)}`,
  AKIA: "AKIAABCDEFGHIJKLMNOP",
  xoxb: `xoxb-${alnum(24)}`,
  AIza: `AIza${alnum(35)}`,
  jwt: `eyJ${alnum(12)}.eyJ${alnum(12)}.${alnum(12)}`,
  bearer: `Bearer ${alnum(24)}`,
};
for (const [family, secret] of Object.entries(families)) {
  test(`redactSecrets strips ${family}`, () => {
    const out = redactSecrets(`before ${secret} after`);
    assert.equal(out, `before ${REDACTED} after`);
  });
}

test("redactSecrets strips the password of a user:pass@ URL, keeps the rest", () => {
  assert.equal(redactSecrets("clone https://bob:hunter2@example.com/repo.git"), `clone https://bob:${REDACTED}@example.com/repo.git`);
});

test("redactSecrets strips key=value / key: value assignments naming a secret", () => {
  assert.equal(redactSecrets("PASSWORD=hunter2 next"), `PASSWORD=${REDACTED} next`);
  assert.equal(redactSecrets('api_key: "abc def"'), `api_key: ${REDACTED}`);
  assert.equal(redactSecrets("client-secret = 'x y'"), `client-secret = ${REDACTED}`);
  assert.equal(redactSecrets("db_token:abc,rest"), `db_token:${REDACTED},rest`);
});

test("redactSecrets leaves clean text alone", () => {
  assert.equal(redactSecrets("nothing to see here"), "nothing to see here");
});

test("truncate cuts at maxLength", () => {
  assert.equal(truncate("abcdef", 3), "abc");
  assert.equal(truncate("ab", 3), "ab");
});

test("redact then truncate: a secret straddling the cut is redacted, not half-kept", () => {
  const secret = `ghp_${alnum(36)}`;
  const text = `token ${secret} tail`;
  const cut = 6 + 10; // mid-secret
  assert.ok(truncate(text, cut).includes("ghp_"), "precondition: truncating first would leak a prefix");
  const out = truncate(redactSecrets(text), cut);
  assert.equal(out, `token ${REDACTED} tail`.slice(0, cut));
  assert.ok(!out.includes("ghp_"));
});
