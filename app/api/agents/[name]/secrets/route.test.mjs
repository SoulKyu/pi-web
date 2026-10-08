import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-secretsroute-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { GET, PUT, DELETE } = await jiti.import("./route.ts");
const reg = await jiti.import("../../../../../lib/agents/registry.ts");
reg.createLongTermAgent({ name: "Lea", role: "r", toolsPreset: "standard", avatar: { emoji: "x", color: "#aaaaaa" } });
const ctx = (name) => ({ params: Promise.resolve({ name }) });
const send = (fn, name, body, type = "application/json") => fn(new Request("http://localhost/x", { method: "PUT", headers: type ? { "Content-Type": type } : {}, body: JSON.stringify(body) }), ctx(name));
const VALUE = "very-secret-value-42";

test("unknown agent -> 404 on every method", async () => {
  assert.equal((await GET(new Request("http://localhost/x"), ctx("Nobody"))).status, 404);
  assert.equal((await send(PUT, "Nobody", { name: "A", value: "v" })).status, 404);
  assert.equal((await send(DELETE, "Nobody", { name: "A" })).status, 404);
});

test("PUT 204, GET lists names only, DELETE 204 then 404; the value is in no response", async () => {
  const bodies = [];
  const put = await send(PUT, "Lea", { name: "API_KEY", value: VALUE });
  assert.equal(put.status, 204);
  const get = await GET(new Request("http://localhost/x"), ctx("Lea"));
  assert.equal(get.headers.get("Cache-Control"), "no-store");
  bodies.push(await get.text());
  assert.deepEqual(JSON.parse(bodies[0]), { names: ["API_KEY"] });
  assert.equal((await send(DELETE, "Lea", { name: "API_KEY" })).status, 204);
  const gone = await send(DELETE, "Lea", { name: "API_KEY" });
  assert.equal(gone.status, 404);
  bodies.push(await gone.text());
  assert.ok(bodies.every((b) => !b.includes(VALUE)));
});

test("validation errors -> 400 with the reason, never the value; wrong content type -> 415", async () => {
  for (const body of [{ name: "PATH", value: VALUE }, { name: "lower", value: VALUE }, { name: "OK", value: `${VALUE}\nx` }, { name: "OK" }, {}]) {
    const response = await send(PUT, "Lea", body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const text = await response.text();
    assert.ok(!text.includes(VALUE));
    assert.ok(JSON.parse(text).error);
  }
  assert.equal((await send(PUT, "Lea", { name: "OK", value: VALUE }, "text/plain")).status, 415);
});
