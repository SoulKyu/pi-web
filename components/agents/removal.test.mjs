import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url).pathname;

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test("the Agent Ops overlay and its overview/list routes are gone", () => {
  for (const path of [
    "components/agents/AgentsPanel.tsx",
    "components/agents/AssignTaskDialog.tsx",
    "app/api/agent-ops/overview/route.ts",
    "app/api/agent-ops/tasks/route.ts",
    "lib/agent-ops/overview.ts",
    "lib/agent-ops/overview.test.mjs",
  ]) assert.equal(existsSync(join(root, path)), false, path);
  assert.equal(existsSync(join(root, "app/api/agent-ops/tasks/[id]/route.ts")), true);
});

test("no source references the removed overlay", () => {
  const needles = ["AgentsPanel", "/api/agent-ops/overview", "agentOps.assign"];
  for (const file of ["components", "app", "lib", "hooks"].flatMap(sources)) {
    const text = readFileSync(join(root, file), "utf8");
    for (const needle of needles) assert.equal(text.includes(needle), false, `${file} mentions ${needle}`);
  }
});
