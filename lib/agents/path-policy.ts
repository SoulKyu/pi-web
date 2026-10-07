import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { hasParentDirectorySegment, isExistingPathWithinRoots } from "../path-security";

export const HOME_PATH_POLICY_EXTENSION_NAME = "pi-web-home-path-policy";
const PATH_TOOLS = new Set(["read", "grep", "find", "ls"]);

export function pathOfToolInput(toolName: string, input: unknown): string | undefined {
  if (!PATH_TOOLS.has(toolName)) return undefined;
  const path = (input as { path?: unknown } | undefined)?.path;
  return typeof path === "string" ? path : ".";
}

/** realpath-based: a symlink in the home that points outside is outside. A missing path is judged by its existing parent. */
export function homePathBlockReason(toolName: string, path: string, home: string): string | null {
  const target = isAbsolute(path) ? path : resolve(home, path);
  const roots = new Set([home]);
  const ok = hasParentDirectorySegment(target) ? false
    : existsSync(target) ? isExistingPathWithinRoots(target, roots) : isExistingPathWithinRoots(dirname(target), roots);
  return ok ? null : `This isolated run may only read inside the agent home (${home}); "${toolName}" on ${path} is outside the agent home and was blocked.`;
}

/** Isolated runs (webhooks) read external text: a payload must not make them read ~/.ssh or auth.json. */
export function createHomePathPolicyExtension(home: string): InlineExtension {
  return {
    name: HOME_PATH_POLICY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        const path = pathOfToolInput(event.toolName, event.input);
        if (path === undefined) return undefined;
        const reason = homePathBlockReason(event.toolName, path, home);
        return reason ? { block: true, reason } : undefined;
      });
    },
  };
}
