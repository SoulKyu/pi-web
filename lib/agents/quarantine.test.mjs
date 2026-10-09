import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-quarantine-")); // before the imports
const jiti = (await import("jiti")).createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { quarantineAgent, snapshotHome } = await jiti.import("./quarantine.ts");
const { archiveThreadLocked } = await jiti.import("./thread-archive.ts");

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
function fakes(overrides = {}) {
  const calls = [];
  const staging = mkdtempSync(join(tmpdir(), "pi-web-staging-"));
  const deps = {
    pauseAgent: (n) => calls.push(`pause:${n}`),
    abortRunningTasks: (filter) => { calls.push("abort"); return [{ agent: "Lea" }, { agent: "Bob" }].filter(filter).length; },
    listTasks: () => [{ id: "a", agent: "Lea", status: "queued" }, { id: "b", agent: "Bob", status: "queued" }, { id: "c", agent: "Lea", status: "completed" }],
    cancelTask: (id) => calls.push(`cancel:${id}`),
    archiveThread: async () => { calls.push("archive"); return { trash: "/trash/x" }; },
    snapshotHome: () => { calls.push("snapshot"); return "/trash/snap"; },
    vaultSecretNames: () => ["TOKEN", "DB_PASS"],
    stagingDir: () => staging,
    listWebhookTriggers: () => ["t1", "t2"],
    rotateSecret: (id) => { calls.push(`rotate:${id}`); return { ok: true, trigger: { name: `n-${id}` }, webhookSecret: `s-${id}` }; },
    now: () => new Date("2026-01-02T03:04:05.678Z"),
    ...overrides,
  };
  return { deps, calls, staging };
}
const write = (dir, file, body) => writeFileSync(join(dir, file), JSON.stringify(body));

test("pause first, tasks of this agent only, archive without a new thread, secrets once", async () => {
  const { deps, calls } = fakes();
  const result = await quarantineAgent({ name: "Lea" }, deps);
  assert.deepEqual(calls, ["pause:Lea", "abort", "cancel:a", "archive", "snapshot", "rotate:t1", "rotate:t2"]);
  assert.equal(result.snapshot, "/trash/snap");
  assert.equal(result.tasksAborted, 1);
  assert.equal(result.tasksCancelled, 1);
  assert.equal(result.trash, "/trash/x");
  assert.deepEqual(result.vaultSecrets, ["TOKEN", "DB_PASS"]); // names only
  assert.deepEqual(result.secrets, [
    { triggerId: "t1", name: "n-t1", webhookSecret: "s-t1" }, { triggerId: "t2", name: "n-t2", webhookSecret: "s-t2" }]);
  assert.deepEqual(result.errors, []);
});

test("a failed pause throws and nothing else runs", async () => {
  const { deps, calls } = fakes({ pauseAgent: () => { throw new Error("disk"); } });
  await assert.rejects(quarantineAgent({ name: "Lea" }, deps), /disk/);
  assert.deepEqual(calls, []);
});

test("one failing step is collected, the others still run", async () => {
  const { deps, calls } = fakes({ archiveThread: async () => { throw new Error("busy disk"); } });
  const result = await quarantineAgent({ name: "Lea" }, deps);
  assert.deepEqual(result.errors, ["thread: busy disk"]);
  assert.equal(result.trash, null);
  assert.equal(result.secrets.length, 2);
  assert.ok(calls.includes("rotate:t2"));
});

test("only this agent's staged facts (and decisions) move to quarantine-<stamp>", async () => {
  const { deps, staging } = fakes();
  write(staging, `${U1}.json`, { agent: "Lea", text: "x" });
  write(staging, `${U1}.decision.json`, { approved: true });
  write(staging, `${U2}.json`, { agent: "Bob", text: "y" });
  const result = await quarantineAgent({ name: "Lea" }, deps);
  assert.equal(result.staged, 1);
  const moved = join(staging, "quarantine-2026-01-02T030405678Z");
  assert.deepEqual(readdirSync(moved).sort(), [`${U1}.decision.json`, `${U1}.json`]);
  assert.ok(existsSync(join(staging, `${U2}.json`)));
  assert.ok(!existsSync(join(staging, `${U1}.json`)));
});

test("missing staging dir -> 0 moved, no error", async () => {
  const { deps } = fakes({ stagingDir: () => join(tmpdir(), "does-not-exist-47") });
  const result = await quarantineAgent({ name: "Lea" }, deps);
  assert.equal(result.staged, 0);
  assert.deepEqual(result.errors, []);
});

test("archiveThreadLocked force: live wrapper aborted then shut down, archived, no new thread", async () => {
  const order = [];
  const live = { isAlive: () => true, isRunning: () => true, send: async (c) => { order.push(c.type); throw new Error("ignored"); }, shutdown: async () => { order.push("shutdown"); } };
  let starting = 2;
  const deps = {
    getSession: () => live, isStarting: () => starting-- > 0, resolvePath: async () => "/p.jsonl",
    archive: (n, p) => { order.push(`archive:${n}:${p}`); return "/t"; }, invalidate: () => order.push("invalidate"), sleep: async () => {},
  };
  assert.deepEqual(await archiveThreadLocked({ name: "Lea", threadSessionId: "s" }, { force: true }, deps), { trash: "/t" });
  assert.deepEqual(order, ["abort", "shutdown", "archive:Lea:/p.jsonl", "invalidate"]);
});

test("archiveThreadLocked without force: running thread is busy, nothing archived", async () => {
  const live = { isAlive: () => true, isRunning: () => true, send: async () => {}, shutdown: async () => { throw new Error("no"); } };
  const deps = { getSession: () => live, isStarting: () => false, resolvePath: async () => null, archive: () => { throw new Error("no"); }, invalidate: () => {}, sleep: async () => {} };
  assert.deepEqual(await archiveThreadLocked({ name: "Lea", threadSessionId: "s" }, {}, deps), { busy: true });
});

test("a thread still starting after the wait lands in errors, the archive still counts", async () => {
  const { deps } = fakes({ archiveThread: async () => ({ trash: "/trash/y", stillStarting: true }) });
  const result = await quarantineAgent({ name: "Lea" }, deps);
  assert.deepEqual(result.errors, ["thread: still starting after 5 s"]);
  assert.equal(result.trash, "/trash/y");
});

test("the home snapshot copies .git as is and keeps links as links", async () => {
  const { mkdirSync, readlinkSync, readFileSync, symlinkSync } = await import("node:fs");
  const home = mkdtempSync(join(tmpdir(), "pi-web-q-home-"));
  mkdirSync(join(home, ".git", "hooks"), { recursive: true });
  writeFileSync(join(home, ".git", "hooks", "pre-commit"), "#!/bin/sh\nplanted\n");
  writeFileSync(join(home, "MEMORY.md"), "# m\n");
  symlinkSync("/etc/passwd", join(home, "out"));
  const target = snapshotHome({ name: "Lea", home }, "2026-01-02T03-04-05-678Z");
  assert.equal(target, join(process.env.PI_CODING_AGENT_DIR, "agent-spaces", ".trash", "Lea-quarantine-2026-01-02T03-04-05-678Z", "home-snapshot"));
  assert.equal(readFileSync(join(target, ".git", "hooks", "pre-commit"), "utf8"), "#!/bin/sh\nplanted\n");
  assert.equal(readlinkSync(join(target, "out")), "/etc/passwd");
  assert.equal(readFileSync(join(target, "MEMORY.md"), "utf8"), "# m\n");
});

test("a failed snapshot is reported and the later steps still run", async () => {
  const { deps, calls } = fakes({ snapshotHome: () => { throw new Error("ENOSPC"); } });
  const result = await quarantineAgent({ name: "Lea" }, deps);
  assert.equal(result.snapshot, null);
  assert.deepEqual(result.errors, ["snapshot: ENOSPC"]);
  assert.ok(calls.includes("rotate:t2"));
});
