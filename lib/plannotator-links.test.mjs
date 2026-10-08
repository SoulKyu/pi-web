import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { plannotatorLinks } = await jiti.import("./plannotator-links.ts");
const cfg = { host: "192.168.1.182", ports: [30150, 30151] };

test("matches host and port, keeps the path", () => {
  assert.deepEqual(plannotatorLinks("Open http://192.168.1.182:30150/plan?x=1 now", cfg), ["http://192.168.1.182:30150/plan?x=1"]);
});
test("wrong host or port is ignored; no config means none", () => {
  assert.deepEqual(plannotatorLinks("http://192.168.1.18:30150/ http://192.168.1.182:30151x/ http://192.168.1.182:9999/ http://evil.192.168.1.182:30150/", cfg), []);
  assert.deepEqual(plannotatorLinks("http://192.168.1.182:30150/", null), []);
});
test("dedup and cap at 5", () => {
  assert.deepEqual(plannotatorLinks("http://192.168.1.182:30150/a http://192.168.1.182:30150/a", cfg), ["http://192.168.1.182:30150/a"]);
  const many = Array.from({ length: 9 }, (_, i) => `http://192.168.1.182:30150/${i}`).join(" ");
  assert.equal(plannotatorLinks(many, cfg).length, 5);
});
test("loopback aliases when the host is loopback", () => {
  const lo = { host: "127.0.0.1", ports: [30150] };
  assert.deepEqual(plannotatorLinks("http://localhost:30150/p and https://127.0.0.1:30150", lo), ["http://localhost:30150/p", "https://127.0.0.1:30150"]);
  assert.deepEqual(plannotatorLinks("http://localhost:30150/p", cfg), []);
});
test("trailing punctuation is trimmed", () => {
  assert.deepEqual(plannotatorLinks("(see http://192.168.1.182:30150/p).", cfg), ["http://192.168.1.182:30150/p"]);
});
test("userinfo spoof is not a link", () => {
  assert.deepEqual(plannotatorLinks("http://192.168.1.182:30150@evil.com/", cfg), []);
});

test("the tool card builds plan links only from non-external tool results", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
  assert.match(source, /isExternalContentTool\(block\.toolName\) \? \[\] : plannotatorLinks\(/);
});
