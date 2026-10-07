import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { createAgentApproveExtension } from "./agents/agent-approve";
import { createAgentNotifyExtension } from "./agents/agent-notify";
import { createHomePathPolicyExtension } from "./agents/path-policy";
import { createReadOnlyMcpPolicyExtension } from "./mcp-read-only-policy";
import { createProjectCommandBashExtension } from "./project-command-env";
import { readSubagentSessionResources } from "./subagents";

type ProjectShellSettings = { getShellCommandPrefix(): string | undefined; getShellPath(): string | undefined };

/**
 * The extensions every agent-profile session (trusted thread or isolated run) loads. Review of 2026-10-07:
 * without the sanitized bash the thread's shell inherited the whole process environment, and without the
 * read-only MCP policy a read-only preset could still call writing MCP tools.
 */
export function agentProfileExtensionFactories(options: {
  cwd: string; settings: ProjectShellSettings; trustedThread: boolean; agentName?: string; exactSystemPrompt?: InlineExtension; homeOnly?: string;
}): InlineExtension[] {
  return [
    ...(options.exactSystemPrompt ? [options.exactSystemPrompt] : []),
    createReadOnlyMcpPolicyExtension({ selection: (entries) => readSubagentSessionResources(entries)?.tools }),
    ...(options.homeOnly ? [createHomePathPolicyExtension(options.homeOnly)] : []),
    createProjectCommandBashExtension({ cwd: options.cwd, settings: options.settings }),
    ...(options.trustedThread && options.agentName ? [createAgentNotifyExtension({ agentName: options.agentName }), createAgentApproveExtension({ agentName: options.agentName })] : []),
  ];
}
