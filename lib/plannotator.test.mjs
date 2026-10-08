import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { plannotatorConfig, samePlannotator } = await jiti.import("./plannotator.ts");

test("unset port means no config", () => {
  assert.equal(plannotatorConfig({}), null);
  assert.equal(plannotatorConfig({ PLANNOTATOR_URL_HOST: "10.0.0.1" }), null);
});
test("a single port defaults the host to 127.0.0.1", () => {
  assert.deepEqual(plannotatorConfig({ PLANNOTATOR_PORT: "30150" }), { host: "127.0.0.1", ports: [30150] });
});
test("comma list and range", () => {
  assert.deepEqual(plannotatorConfig({ PLANNOTATOR_PORT: "1, 3,5", PLANNOTATOR_URL_HOST: "h" }), { host: "h", ports: [1, 3, 5] });
  assert.deepEqual(plannotatorConfig({ PLANNOTATOR_PORT: "30150-30152", PLANNOTATOR_URL_HOST: "192.168.1.182" }), { host: "192.168.1.182", ports: [30150, 30151, 30152] });
});
test("invalid values give null", () => {
  for (const port of ["abc", "0", "70000", "5-3", "1-100", "1,x", "", "1-"]) {
    assert.equal(plannotatorConfig({ PLANNOTATOR_PORT: port }), null, port);
  }
});
test("host is lowercased", () => {
  assert.deepEqual(plannotatorConfig({ PLANNOTATOR_PORT: "1", PLANNOTATOR_URL_HOST: "Box.LAN" }), { host: "box.lan", ports: [1] });
});
test("samePlannotator compares host and ports", () => {
  const a = { host: "h", ports: [1, 2] };
  assert.equal(samePlannotator(a, { host: "h", ports: [1, 2] }), true);
  assert.equal(samePlannotator(a, { host: "h", ports: [1, 3] }), false);
  assert.equal(samePlannotator(a, { host: "x", ports: [1, 2] }), false);
  assert.equal(samePlannotator(a, null), false);
  assert.equal(samePlannotator(null, null), true);
});
