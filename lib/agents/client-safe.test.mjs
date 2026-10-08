import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The profile dialog bundles these for the browser: a value import of a server module drags node:fs, the SDK and redact.ts (a RegExp lookbehind, unparseable on iOS 16.2) into the client.
const FILES = ["command-policy.ts", "egress-policy.ts", "fence.ts", "agent-name.ts", "audit-types.ts"];
const FORBIDDEN = /^(node:|\.\/audit$|\.\/registry$|\.\.\/agent-ops\/redact$|@earendil-works\/pi-coding-agent$)/;

for (const file of FILES) {
  test(`${file} has no value import of a server module`, () => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const match of source.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (match[2]) continue; // type-only
      assert.doesNotMatch(match[3], FORBIDDEN, `${file} imports ${match[3]}`);
    }
    assert.doesNotMatch(source, /^\s*import\s+["']/m);
  });
}
