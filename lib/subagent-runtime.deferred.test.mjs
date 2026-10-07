import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { parseSubagentModelOrDeferred } = await jiti.import("./subagent-runtime.ts");
const { rememberProviderModels } = await jiti.import("./deferred-provider-models.ts");

const opus = { provider: "claude-bridge", id: "claude-opus-5-5" };
const glm = { provider: "zai", id: "glm-4.7" };

function runtime(registered) {
  return {
    getModels: () => registered,
    getAvailable: async () => registered,
    getModel: (provider, id) => registered.find((model) => model.provider === provider && model.id === id),
  };
}

beforeEach(async () => {
  globalThis.__piWebProviderModelCatalog = undefined;
  await rememberProviderModels(runtime([glm, opus]));
});

test("a model registered only at session_start resolves as deferred", () => {
  assert.deepEqual(parseSubagentModelOrDeferred(runtime([glm]), "claude-bridge/claude-opus-5-5"), { deferred: opus });
});

test("a model the runtime has resolves as model", () => {
  assert.deepEqual(parseSubagentModelOrDeferred(runtime([glm]), "zai/glm-4.7"), { model: glm });
});

test("an unknown model still throws not found", () => {
  assert.throws(() => parseSubagentModelOrDeferred(runtime([glm]), "nope/none"), /Subagent model not found: nope\/none/);
});

test("an empty value resolves to nothing", () => {
  assert.deepEqual(parseSubagentModelOrDeferred(runtime([glm]), undefined), { model: undefined });
});
