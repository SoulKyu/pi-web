import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "agentops-")); // avant l'import
const store = await (await import("jiti")).createJiti(import.meta.url).import("./task-store.ts");

test("create, claim via lock, complete; terminal states immutable", () => {
  const task = store.createTask({ profile: "leandro", cwd: "/p", title: "Diag", prompt: "Analyse", origin: "ui" });
  assert.equal(task.status, "queued");
  assert.equal(store.claimTask(task.id), true);      // lock wx créé
  assert.equal(store.claimTask(task.id), false);     // déjà pris
  const claimed = store.getTask(task.id);
  assert.equal(claimed.status, "running");           // le record reste lisible
  store.updateTask(task.id, { sessionId: "s9" });
  store.updateTask(task.id, { status: "completed", result: "done" });
  assert.throws(() => store.updateTask(task.id, { status: "running" }));  // immuable
  assert.throws(() => store.updateTask(task.id, { status: "failed" }));   // immuable
});

test("claim is exclusive across simulated processes", () => {
  const a = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  assert.equal(store.claimTask(a.id), true);
  assert.equal(store.claimTask(a.id), false); // fresh lock attempt must fail
});

test("recoverInterrupted fails running tasks whose lock pid is dead", () => {
  const t = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  store.claimTask(t.id);
  writeFileSync(join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "tasks", `${t.id}.lock`), JSON.stringify({ pid: 999999999 }));
  store.recoverInterrupted();
  assert.equal(store.getTask(t.id).status, "failed");
  assert.match(store.getTask(t.id).error, /interrupted/);
});

test("recoverInterrupted frees an orphan lock on a queued task (crash mid-claim)", () => {
  const t = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  // crash between the wx lock create and the running write: queued + lock with dead pid
  writeFileSync(join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "tasks", `${t.id}.lock`), JSON.stringify({ pid: 999999999 }));
  store.recoverInterrupted();
  assert.equal(store.getTask(t.id).status, "queued"); // record intact
  assert.equal(store.claimTask(t.id), true);          // re-claimable again
});

test("recoverInterrupted keeps a fresh unreadable lock (another process mid-claim)", () => {
  const t = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  writeFileSync(join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "tasks", `${t.id}.lock`), ""); // open wx done, writeSync not yet
  store.recoverInterrupted();
  assert.equal(store.claimTask(t.id), false); // lock still held
});

test("attachSession records the session id even on a terminal task", () => {
  const t = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  store.cancelTask(t.id);
  store.attachSession(t.id, "s-late"); // never throws
  assert.equal(store.getTask(t.id).sessionId, "s-late");
  assert.equal(store.getTask(t.id).status, "cancelled");
});

test("cancelTask marks queued cancelled, keeps the record", () => {
  const t = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  assert.equal(store.cancelTask(t.id), true);
  assert.equal(store.getTask(t.id).status, "cancelled"); // record conservé (audit)
});

test("claimTask releases lock and returns false if task went terminal between read and claim", () => {
  const t = store.createTask({ profile: "x", cwd: "/p", title: "t", prompt: "p", origin: "ui" });
  store.cancelTask(t.id);
  assert.equal(store.claimTask(t.id), false);
  // Verify no lock file was left behind
  const lockPath = join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "tasks", `${t.id}.lock`);
  assert.equal(existsSync(lockPath), false);
});

test("getTask returns null for invalid id (path traversal blocked)", () => {
  assert.equal(store.getTask("../x"), null);
  assert.equal(store.getTask("foo/bar"), null);
});

test("claimTask returns false for invalid id (no file creation outside store)", () => {
  assert.equal(store.claimTask("../x"), false);
  const traversalPath = join(process.env.PI_CODING_AGENT_DIR, "agent-ops", "x.lock");
  assert.equal(existsSync(traversalPath), false);
});

test("updateTask throws for invalid id", () => {
  assert.throws(() => store.updateTask("../x", { status: "running" }), /invalid task id/);
});

test("cancelTask returns false for invalid id", () => {
  assert.equal(store.cancelTask("../x"), false);
});
