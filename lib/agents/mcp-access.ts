import { existsSync, lstatSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { parseJsonc } from "../jsonc";

export interface McpAccessOptions { agentDir: string; home: string }
const defaultOptions = (): McpAccessOptions => ({ agentDir: getAgentDir(), home: homedir() });

/** The user-global files pi-mcp-adapter merges into every session. Host imports (Cursor, Claude...) and plugin servers are not read here. */
export function adapterGlobalConfigPaths(agentDir: string, home: string): string[] {
  return [
    join(home, ".config/mcp/mcp.json"), join(home, ".agents/mcp.json"), join(home, ".agents/mcp/mcp.json"),
    join(agentDir, "mcp.json"), join(agentDir, "mcp-adapter.json"),
  ];
}

const warned = new Set<string>();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Names only: the entries hold commands, URLs and tokens, so a value never leaves this function. */
export function listGlobalMcpServers(options: McpAccessOptions = defaultOptions()): string[] {
  const names = new Set<string>();
  for (const path of adapterGlobalConfigPaths(options.agentDir, options.home)) {
    try {
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      const parsed: unknown = parseJsonc(readFileSync(path, "utf8"));
      const servers = isRecord(parsed) ? (parsed.mcpServers ?? parsed["mcp-servers"]) : undefined;
      if (!isRecord(servers)) continue;
      for (const [name, entry] of Object.entries(servers)) {
        if (isRecord(entry) && (entry.disabled === true || entry.enabled === false)) continue;
        names.add(name);
      }
    } catch {
      if (!warned.has(path)) { warned.add(path); console.warn(`[pi-web] MCP access: cannot read ${path}`); } // path only, never content
    }
  }
  return [...names].sort();
}

export const agentMcpOverridesPath = (home: string): string => join(home, ".pi", "mcp-adapter.json");

/**
 * pi-web owns this file in agent homes: the adapter merges `<cwd>/.pi/mcp-adapter.json` over the global config, and
 * `disabled: true` turns a global server off without a prompt. Regenerated before every thread open and isolated run,
 * so a server added globally later stays blocked (fail-closed). Hand edits are overwritten.
 */
export function syncAgentMcpOverrides(home: string, allowed: readonly string[], options: McpAccessOptions = defaultOptions()): void {
  const blocked = listGlobalMcpServers(options).filter((name) => !allowed.includes(name));
  const content = `${JSON.stringify({ mcpServers: Object.fromEntries(blocked.map((name) => [name, { disabled: true }])) }, null, 2)}\n`;
  const path = agentMcpOverridesPath(home);
  mkdirSync(join(home, ".pi"), { recursive: true, mode: 0o700 });
  try { if (lstatSync(path).isFile() && readFileSync(path, "utf8") === content) return; } catch { /* absent: write it */ }
  writePrivateFileAtomicSync(path, content);
}
