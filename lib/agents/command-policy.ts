import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { AuditPolicy, BlockEvent } from "./audit-types";

export const COMMAND_POLICY_EXTENSION_NAME = "pi-web-command-policy";

// Each pattern is at most 200 characters and nests no quantifier (NESTED_QUANTIFIER_RE), so none can backtrack catastrophically.
export const COMMAND_DENY_PRESETS: Record<"cautious-sre" | "reports-only", string[]> = {
  "cautious-sre": [
    "\\brm\\s[^|;&]*(-[a-zA-Z]*[rR]|--recursive)[^|;&]*\\s[\"']?(/\\*?|~/?|\\$HOME/?|\\$\\{HOME\\}/?)[\"']?(\\s|;|&|\\||$)",
    "\\b(terraform|tofu)\\s([^|;&]*\\s)?(apply|destroy)\\b",
    "\\bkubectl\\s([^|;&]*\\s)?(delete|apply|drain|replace)\\b",
    "\\bgit\\s([^|;&]*\\s)?push\\s([^|;&]*\\s)?(-f|--force|\\+\\S+)(\\s|$)",
    "\\|\\s*(sudo\\s+)?(\\S*/)?(ba|z|da|k)?sh\\b",
    "\\b(ba|z|da)?sh\\s([^|;&]*\\s)?(<\\(|-c\\s+[\"']?\\$\\()\\s*(curl|wget)\\b",
  ],
  "reports-only": [
    "\\b(curl|wget|nc|ncat|socat|ssh|scp|sftp|rsync|telnet|ftp)\\b",
    "/dev/(tcp|udp)/",
    "\\b(python[23]?|node|deno|bun|perl|ruby|php)\\s([^|;&]*\\s)?(-[a-zA-Z]*[ceE]|--eval)\\s.*(socket|urllib|http|fetch|request|curl|wget)",
    "\\bgh\\s([^|;&]*\\s)?(api|gist\\s+create)\\b",
    "\\bgit\\s([^|;&]*\\s)?push\\b",
  ],
};

/** A group ending in a quantifier that is itself quantified, e.g. `(a+)+`: the classic catastrophic-backtracking shape. A heuristic, not a proof. */
export const NESTED_QUANTIFIER_RE = /\([^)]*[+*]\)[+*{]/;
/** `RegExp.test` is synchronous: a longer command is refused instead of risking a frozen process. */
export const COMMAND_MAX_LENGTH = 65_536;

/** Compiled as given, no implicit flags: bash is case-sensitive. Sources that do not compile are skipped. */
export function compileDenyPatterns(sources: readonly string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const source of sources) {
    try { patterns.push(new RegExp(source)); } catch { /* validated at write; skip a stale entry */ }
  }
  return patterns;
}

// PowerShell is case-insensitive (Remove-Item vs remove-item); each pattern gets its `i` clone once.
const insensitiveClones = new WeakMap<RegExp, RegExp>();
const insensitive = (pattern: RegExp): RegExp => {
  let clone = insensitiveClones.get(pattern);
  if (!clone) { clone = new RegExp(pattern.source, "i"); insensitiveClones.set(pattern, clone); }
  return clone;
};

export function commandDenyReason(toolName: string, input: unknown, patterns: readonly RegExp[]): string | null {
  if (toolName !== "bash" && toolName !== "powershell") return null;
  const command = (input as { command?: unknown } | undefined)?.command;
  if (typeof command !== "string") return null;
  if (command.length > COMMAND_MAX_LENGTH) return "command too long for the policy check";
  const match = patterns.find((pattern) => (toolName === "powershell" ? insensitive(pattern) : pattern).test(command));
  return match ? `command denied by the agent's policy: matches /${match.source}/` : null;
}

/** Top-level and nested (codemode, parentToolCallId set) bash calls all pass through tool_call. */
export function createCommandPolicyExtension(sources: readonly string[], onBlock?: (policy: AuditPolicy, event: BlockEvent) => void): InlineExtension {
  const patterns = compileDenyPatterns(sources);
  return {
    name: COMMAND_POLICY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        try {
          const reason = commandDenyReason(event.toolName, event.input, patterns);
          if (reason) onBlock?.("deny", event);
          return reason ? { block: true, reason } : undefined;
        } catch {
          return { block: true, reason: "command policy error" };
        }
      });
    },
  };
}
