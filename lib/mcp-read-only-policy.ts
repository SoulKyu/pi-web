import type { InlineExtension, ToolInfo } from "@earendil-works/pi-coding-agent";
import { MCP_EXTENSION_PATH } from "./mcp-command";
import { readSessionToolSelection } from "./session-tool-selection";
import type { SessionEntry } from "./types";

// A Read-only session pins coding tools that cannot change anything, but MCP
// tools stay callable beside them, directly or from a codemode script. While
// such a selection is pinned, this policy blocks every MCP tool its server
// does not mark `readOnlyHint: true` (ADR 0006, "Safety → Read-only"). The
// hint comes from the server: the policy keeps the model from writing through
// a tool by mistake, it does not defend against a malicious server.

const WRITE_CAPABLE_TOOLS = new Set(["bash", "powershell", "edit", "write"]);
const MCP_TOOL_PREFIX = "mcp__";
// pi-mcp-adapter registers direct tools as `<server>_<tool>` (configurable prefix), so the name cannot identify them: its extension path can.
const MCP_ADAPTER_PATH = /[\\/]pi-mcp-adapter[\\/]/;

export const READ_ONLY_MCP_POLICY_EXTENSION_NAME = "pi-web-read-only-mcp";

/**
 * Whether a pinned tool selection is read-only: it names tools, and none of
 * them can write or run commands. The Read-only preset is one; so is a subset
 * of it. No pin (pi's configured tools) is not.
 */
export function isReadOnlySelection(tools: readonly string[] | undefined): boolean {
  return tools !== undefined && tools.length > 0 && !tools.some((name) => WRITE_CAPABLE_TOOLS.has(name));
}

/** A tool the MCP extension or the pi-mcp-adapter package registered, or one named like an MCP tool by another MCP extension. */
export function isMcpTool(tool: Pick<ToolInfo, "name" | "sourceInfo">): boolean {
  const path = tool.sourceInfo?.path;
  return path === MCP_EXTENSION_PATH || (path !== undefined && MCP_ADAPTER_PATH.test(path)) || tool.name.startsWith(MCP_TOOL_PREFIX);
}

export function readOnlyMcpBlockReason(toolName: string): string {
  return `This session uses a read-only tool selection, and the MCP server does not mark "${toolName}" as read-only (readOnlyHint), so the call was blocked. Switch the session to a preset that allows changes to use it.`;
}

export type ToolSelectionReader = (entries: SessionEntry[]) => readonly string[] | undefined;

/** `selection` reads the pinned tools of the session: pi-web's selection entry by default, or the agent-profile snapshot. */
export function createReadOnlyMcpPolicyExtension(options: { selection?: ToolSelectionReader } = {}): InlineExtension {
  const readSelection = options.selection ?? readSessionToolSelection;
  return {
    name: READ_ONLY_MCP_POLICY_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      // Nested calls (a codemode script's) pass through tool_call as well, with parentToolCallId set.
      pi.on("tool_call", (event, ctx) => {
        const tool = pi.getAllTools().find((candidate) => candidate.name === event.toolName);
        if (!tool || !isMcpTool(tool) || tool.annotations?.readOnlyHint === true) return undefined;
        // Read last: most calls are not MCP calls, and the selection scan walks the session.
        const selection = readSelection(ctx.sessionManager.getEntries() as unknown as SessionEntry[]);
        if (!isReadOnlySelection(selection)) return undefined;
        return { block: true, reason: readOnlyMcpBlockReason(event.toolName) };
      });
    },
  };
}
