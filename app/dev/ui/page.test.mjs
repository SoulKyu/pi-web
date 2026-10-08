import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
const proxy = await readFile(new URL("../../../proxy.ts", import.meta.url), "utf8");

test("the gallery is a 404 in production builds", () => {
  assert.match(page, /if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/);
});

test("the proxy guards /dev like the app root, so the web password applies", () => {
  const matcher = proxy.match(/matcher: \[([^\]]*)\]/)?.[1] ?? "";
  for (const path of ['"/"', '"/login"', '"/api/:path*"', '"/dev/:path*"']) assert.ok(matcher.includes(path), path);
});
