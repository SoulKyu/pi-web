import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-agent-delegate-"));
const { createAgentDelegateExtension, delegationRefusal, AGENT_DELEGATE_TOOL, DELEGATIONS_PER_HOUR } = await (await import("jiti")).createJiti(import.meta.url).import("./agent-delegate.ts");

const target = { name: "bob", role: "Reviews code\nsecond line", home: "/h/bob", acceptsDelegation: true };
const base = { from: "alice", to: "bob", target, runningTasks: [], recent: [] };
const now = Date.now();
const mine = (ago) => ({ id: "x", requestedBy: "alice", createdAt: new Date(now - ago).toISOString() });

test("refusals, in order", () => {
  assert.equal(delegationRefusal({ ...base, to: "alice" }), "cannot delegate to yourself");
  assert.equal(delegationRefusal({ ...base, target: null }), "unknown agent");
  assert.equal(delegationRefusal({ ...base, target: { ...target, acceptsDelegation: undefined } }), "bob does not accept delegations");
  assert.equal(delegationRefusal({ ...base, target: { ...target, acceptsDelegation: false } }), "bob does not accept delegations");
  assert.equal(delegationRefusal(base), null);
});

test("depth 1: a running thread task of `from` requested by an agent refuses", () => {
  const running = { agent: "alice", target: "thread", status: "running", requestedBy: "carol" };
  assert.equal(delegationRefusal({ ...base, runningTasks: [running] }), "a delegated task cannot delegate (depth 1)");
  for (const other of [{ requestedBy: "user" }, { requestedBy: undefined }, { status: "queued" }, { target: "isolated" }, { agent: "bob" }]) {
    assert.equal(delegationRefusal({ ...base, runningTasks: [{ ...running, ...other }] }), null);
  }
});

test("cap: DELEGATIONS_PER_HOUR recent tasks of `from` within the last hour", () => {
  assert.equal(DELEGATIONS_PER_HOUR, 10);
  const full = Array.from({ length: 10 }, () => mine(60_000));
  assert.equal(delegationRefusal({ ...base, recent: full }), "delegation cap reached");
  assert.equal(delegationRefusal({ ...base, recent: full.slice(1) }), null);
  assert.equal(delegationRefusal({ ...base, recent: [...full.slice(1), mine(3_700_000)] }), null);
  assert.equal(delegationRefusal({ ...base, recent: [...full.slice(1), { ...mine(1000), requestedBy: "user" }] }), null);
});

function setup(overrides = {}) {
  const created = [];
  let kicks = 0;
  const tools = [];
  const deps = {
    readAgent: (name) => (name === "bob" ? target : null),
    listTasks: () => [],
    createTask: (input) => { created.push(input); return { id: "task-1", ...input }; },
    kick: () => { kicks++; },
    listAgents: () => [target, { name: "dan", role: "Not open", acceptsDelegation: false }, { name: "eve", role: "x".repeat(300), acceptsDelegation: true }],
    ...overrides,
  };
  createAgentDelegateExtension({ agentName: "alice", deps }).factory({ registerTool: (tool) => tools.push(tool), on: () => {} });
  return { tool: tools[0], created, kicks: () => kicks };
}

test("registers the tool; description lists accepting agents with a clipped first role line", () => {
  const { tool } = setup();
  assert.equal(tool.name, AGENT_DELEGATE_TOOL);
  assert.match(tool.description, /bob: Reviews code/);
  assert.doesNotMatch(tool.description, /second line|dan/);
  assert.match(tool.description, new RegExp(`eve: x{119}…`));
  assert.doesNotMatch(tool.description, /x{121}/);
});

test("happy path creates the thread task for the target, delivering to the caller, and kicks", async () => {
  const { tool, created, kicks } = setup();
  const result = await tool.execute("c", { agent: "bob", task: "Review PR 12\nplease" });
  assert.equal(result.content[0].text, "Queued as task task-1 for bob; the result will appear as a card in this thread.");
  assert.deepEqual(created, [{ agent: "bob", target: "thread", kind: "task", profile: "bob", cwd: "/h/bob", prompt: "Review PR 12\nplease", title: "Review PR 12 please", origin: "agent", requestedBy: "alice", deliverTo: "alice" }]);
  assert.equal(kicks(), 1);
});

test("a refusal is returned as text, prefixed, and creates nothing", async () => {
  const { tool, created, kicks } = setup();
  const result = await tool.execute("c", { agent: "alice", task: "me" });
  assert.equal(result.content[0].text, "Refused: cannot delegate to yourself");
  assert.equal(created.length + kicks(), 0);
});

test("the title is the first 60 characters", async () => {
  const { tool, created } = setup();
  await tool.execute("c", { agent: "bob", task: "y".repeat(100) });
  assert.equal(created[0].title, "y".repeat(60));
});
