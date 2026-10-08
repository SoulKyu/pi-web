import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-web-health-route-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const previous = { port: process.env.PLANNOTATOR_PORT, host: process.env.PLANNOTATOR_URL_HOST };
test.after(async () => {
  for (const [key, value] of [["PI_CODING_AGENT_DIR", previousAgentDir], ["PLANNOTATOR_PORT", previous.port], ["PLANNOTATOR_URL_HOST", previous.host]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(agentDir, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { GET } = await jiti.import("./route.ts");

test("plannotator is null when unconfigured and { host, ports } when set", async () => {
  delete process.env.PLANNOTATOR_PORT;
  delete process.env.PLANNOTATOR_URL_HOST;
  assert.equal((await (await GET()).json()).plannotator, null);
  process.env.PLANNOTATOR_PORT = "30150-30151";
  process.env.PLANNOTATOR_URL_HOST = "192.168.1.182";
  assert.deepEqual((await (await GET()).json()).plannotator, { host: "192.168.1.182", ports: [30150, 30151] });
});
