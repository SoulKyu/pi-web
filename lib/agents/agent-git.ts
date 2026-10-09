import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const MEMORY_MD_PATCH_MAX = 8 * 1024;
const HISTORY_LIMIT = 20;

export interface MemoryMdCommit { hash: string; date: string; subject: string; patch: string; truncated: boolean }

/** Newest first. The agent writes its own .git: no fsmonitor, hooks, external diff or textconv runs (see long-term-agents.md). */
export async function memoryMdHistory(home: string): Promise<MemoryMdCommit[]> {
  if (!existsSync(join(home, ".git"))) return []; // never walk up into a parent repo
  const { stdout } = await execFileAsync("git", [
    "-C", home, "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
    "log", `-n${HISTORY_LIMIT}`, "--no-color", "--no-ext-diff", "--no-textconv", "--format=%x1e%H%x1f%aI%x1f%s%x1f", "-p", "--", "MEMORY.md",
  ], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } });
  return stdout.split("\x1e").filter(Boolean).map((record) => {
    const [hash, date, subject, rest = ""] = record.split("\x1f");
    const patch = rest.trim();
    return { hash, date, subject, patch: patch.slice(0, MEMORY_MD_PATCH_MAX), truncated: patch.length > MEMORY_MD_PATCH_MAX };
  });
}
