import type { InlineExtension } from "@earendil-works/pi-coding-agent";

export const COMMAND_POLICY_EXTENSION_NAME = "pi-web-command-policy";

export const COMMAND_DENY_PRESETS: Record<"cautious-sre" | "reports-only", string[]> = {
  "cautious-sre": ["\\brm\\s+-rf\\s+/", "\\bterraform\\s+apply\\b", "\\bkubectl\\s+(delete|apply)\\b", "--force\\b", "\\|\\s*(ba|z)?sh\\b", "\\bgit\\s+push\\b.*--force"],
  "reports-only": ["\\b(curl|wget|nc|ncat|ssh|scp)\\b", "python[23]?\\s+-c\\s+.*socket", "\\bgit\\s+push\\b"],
};

/** Compiled as given, no implicit flags: bash is case-sensitive. Sources that do not compile are skipped. */
export function compileDenyPatterns(sources: readonly string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const source of sources) {
    try { patterns.push(new RegExp(source)); } catch { /* validated at write; skip a stale entry */ }
  }
  return patterns;
}

export function commandDenyReason(toolName: string, input: unknown, patterns: readonly RegExp[]): string | null {
  if (toolName !== "bash" && toolName !== "powershell") return null;
  const command = (input as { command?: unknown } | undefined)?.command;
  if (typeof command !== "string") return null;
  const match = patterns.find((pattern) => pattern.test(command));
  return match ? `command denied by the agent's policy: matches /${match.source}/` : null;
}

/** Top-level and nested (codemode, parentToolCallId set) bash calls all pass through tool_call. */
export function createCommandPolicyExtension(sources: readonly string[]): InlineExtension {
  const patterns = compileDenyPatterns(sources);
  return {
    name: COMMAND_POLICY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        try {
          const reason = commandDenyReason(event.toolName, event.input, patterns);
          return reason ? { block: true, reason } : undefined;
        } catch {
          return { block: true, reason: "command policy error" };
        }
      });
    },
  };
}
