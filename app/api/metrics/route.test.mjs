import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-metrics-route-"));
const previous = process.env.PI_WEB_METRICS_TOKEN;
test.after(() => { if (previous === undefined) delete process.env.PI_WEB_METRICS_TOKEN; else process.env.PI_WEB_METRICS_TOKEN = previous; });
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { GET } = await jiti.import("./route.ts");
const { recordRunMetrics, resetRunMetrics } = await jiti.import("../../../lib/agent-ops/metrics.ts");
const call = (authorization) => GET(new Request("http://localhost/api/metrics", { headers: authorization ? { authorization } : {} }));

test("404 while PI_WEB_METRICS_TOKEN is unset or empty, even with a header", async () => {
  delete process.env.PI_WEB_METRICS_TOKEN;
  assert.equal((await call("Bearer x")).status, 404);
  process.env.PI_WEB_METRICS_TOKEN = "";
  assert.equal((await call("Bearer ")).status, 404);
});

test("401 without or with a wrong bearer, 200 text/plain with the right one", async () => {
  process.env.PI_WEB_METRICS_TOKEN = "s3cret-token";
  resetRunMetrics();
  recordRunMetrics({ ts: "t", agent: "sre", origin: "ui", status: "completed", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 }, billing: "api" });
  for (const header of [undefined, "Bearer nope", "Bearer s3cret-token-longer", "Basic s3cret-token", "s3cret-token"]) {
    const res = await call(header);
    assert.equal(res.status, 401, String(header));
    assert.equal(res.headers.get("www-authenticate"), "Bearer");
  }
  const ok = await call("Bearer s3cret-token");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "text/plain; version=0.0.4; charset=utf-8");
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.text();
  assert.ok(body.includes('pi_web_runs_total{agent="sre",origin="ui",status="completed"} 1'));
  assert.ok(!body.includes("s3cret-token"));
});
