import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const { memoryMdHistory, MEMORY_MD_PATCH_MAX } = await (await import("jiti")).createJiti(import.meta.url).import("./agent-git.ts");

function repo() {
  const home = mkdtempSync(join(tmpdir(), "pi-web-agent-git-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=a", "-c", "user.email=a@x", "-c", "commit.gpgsign=false", ...args], { cwd: home });
  git("init", "-q", "-b", "main");
  const commit = (file, body, message) => { writeFileSync(join(home, file), body); git("add", "-A"); git("commit", "-q", "-m", message); };
  return { home, git, commit };
}

test("only commits touching MEMORY.md, newest first, with their patch", async () => {
  const { home, commit } = repo();
  commit("MEMORY.md", "# m\n", "chore: init");
  commit("notes.md", "n\n", "docs: notes");
  commit("MEMORY.md", "# m\n- fact one\n", "docs: remember fact one");
  const history = await memoryMdHistory(home);
  assert.deepEqual(history.map((c) => c.subject), ["docs: remember fact one", "chore: init"]);
  assert.match(history[0].patch, /^\+- fact one$/m);
  assert.match(history[0].hash, /^[0-9a-f]{40}$/);
  assert.ok(!Number.isNaN(Date.parse(history[0].date)));
  assert.equal(history[0].truncated, false);
});

test("a long patch is cut and flagged", async () => {
  const { home, commit } = repo();
  commit("MEMORY.md", `${"x".repeat(MEMORY_MD_PATCH_MAX * 2)}\n`, "docs: big");
  const [big] = await memoryMdHistory(home);
  assert.equal(big.patch.length, MEMORY_MD_PATCH_MAX);
  assert.equal(big.truncated, true);
});

test("a home without .git has no history, even inside another repo", async () => {
  const { home } = repo();
  const inner = join(home, "inner");
  execFileSync("mkdir", [inner]);
  assert.deepEqual(await memoryMdHistory(inner), []);
});

test("a planted core.fsmonitor or textconv never runs", async () => {
  const { home, git, commit } = repo();
  commit("MEMORY.md", "# m\n", "chore: init");
  const marker = `${home}-PWNED`;
  git("config", "core.fsmonitor", `touch '${marker}'; false`);
  git("config", "diff.evil.textconv", `sh -c 'touch ${marker}; cat "$1"' -`);
  writeFileSync(join(home, ".gitattributes"), "MEMORY.md diff=evil\n");
  commit("MEMORY.md", "# m\n- b\n", "docs: b");
  rmSync(marker, { force: true }); // the setup's own git add ran the planted fsmonitor
  await memoryMdHistory(home);
  assert.equal(existsSync(marker), false);
});
