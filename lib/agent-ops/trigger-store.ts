import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SubagentProfile } from "../subagents";

function sha256Of(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Closed allowlist. A blocklist (bash/write/edit/powershell) misses every extension tool
 *  that runs code: a subagent tool spawning a child with bash, an MCP adapter, an
 *  interactive shell. Anything not listed here is refused. */
export const TRIGGER_TOOL_ALLOWLIST: ReadonlySet<string> = new Set(["read", "grep", "find", "ls", "memory_search", "memory_save"]);

/** Authoritative check, run in start() on the tools the session actually activated
 *  (`get_tools`, lib/rpc-manager.ts:1104), extension tools included. */
export function checkActiveTriggerTools(activeTools: readonly string[]): string | null {
  const outside = activeTools.filter((t) => !TRIGGER_TOOL_ALLOWLIST.has(t));
  return outside.length ? `trigger run refused: tools outside the allowlist: ${outside.join(", ")}` : null;
}

/** Pin hash: file-backed profiles hash their file; built-ins hash the resolved snapshot. */
export function profilePinSha256(profile: SubagentProfile): string {
  if (profile.filePath) return sha256Of(readFileSync(profile.filePath));
  return sha256Of(JSON.stringify({
    systemPrompt: profile.systemPrompt, tools: profile.tools, extensionTools: profile.extensionTools,
    loadSkills: profile.loadSkills, loadExtensions: profile.loadExtensions,
    model: profile.model, maxTurns: profile.maxTurns,
  }));
}
