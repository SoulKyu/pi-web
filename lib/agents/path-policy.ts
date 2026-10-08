import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { blockLine, type AuditLine } from "./audit";
import { hasParentDirectorySegment, isExistingPathWithinRoots } from "../path-security";

export const HOME_PATH_POLICY_EXTENSION_NAME = "pi-web-home-path-policy";
const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;
const PATH_TOOLS = new Set(["read", "grep", "find", "ls"]);

export function pathOfToolInput(toolName: string, input: unknown): string | undefined {
  if (!PATH_TOOLS.has(toolName)) return undefined;
  const path = (input as { path?: unknown } | undefined)?.path;
  return typeof path === "string" ? path : ".";
}

/** realpath-based: a symlink in the home that points outside is outside. A path that does not exist is blocked: pi retries a missing path with rewritten variants (NNBSP, NFD, curly quotes), which could open a different file than the one checked. */
export function homePathBlockReason(toolName: string, path: string, home: string): string | null {
  // pi's tools normalize their path (@ strip, ~ expansion, file://, Unicode spaces) before use, and that is not exported:
  // reject what the normalizer would rewrite instead of judging a different path than the one pi opens.
  if (/^(~|@|file:)/i.test(path) || UNICODE_SPACES.test(path)) {
    return `This isolated run may only read inside the agent home (${home}); "${toolName}" on ${path} was blocked: paths starting with ~, @ or file: and paths with Unicode spaces are not allowed, use a plain path inside the agent home.`;
  }
  const target = isAbsolute(path) ? path : resolve(home, path);
  const roots = new Set([home]);
  const ok = hasParentDirectorySegment(target) ? false
    : existsSync(target) && isExistingPathWithinRoots(target, roots);
  return ok ? null : `This isolated run may only read inside the agent home (${home}); "${toolName}" on ${path} is outside the agent home and was blocked.`;
}

function findPatternBlockReason(toolName: string, input: unknown): string | null {
  if (toolName !== "find") return null;
  const pattern = (input as { pattern?: unknown } | undefined)?.pattern;
  if (typeof pattern !== "string") return null;
  return pattern.startsWith("/") || pattern.split(/[\\/]/).includes("..") ? "The find pattern may not leave the agent home (no absolute pattern, no .. segment)." : null;
}

/** Isolated runs (webhooks) read external text: a payload must not make them read ~/.ssh or auth.json. */
export function createHomePathPolicyExtension(home: string, onBlock?: (line: AuditLine) => void): InlineExtension {
  return {
    name: HOME_PATH_POLICY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        const path = pathOfToolInput(event.toolName, event.input);
        if (path === undefined) return undefined;
        const reason = homePathBlockReason(event.toolName, path, home) ?? findPatternBlockReason(event.toolName, event.input);
        if (reason) onBlock?.(blockLine("path", event));
        return reason ? { block: true, reason } : undefined;
      });
    },
  };
}
