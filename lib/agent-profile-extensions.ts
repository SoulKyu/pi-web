import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { appendAuditSafe } from "./agents/audit";
import { createAgentApproveExtension } from "./agents/agent-approve";
import { createAgentDelegateExtension } from "./agents/agent-delegate";
import { createAgentNotifyExtension } from "./agents/agent-notify";
import { createCommandPolicyExtension } from "./agents/command-policy";
import { createEgressPolicyExtension } from "./agents/egress-policy";
import { createHomePathPolicyExtension } from "./agents/path-policy";
import { createSecretRedactionExtension } from "./agents/secret-redaction";
import { readSecrets } from "./agents/secrets";
import { createUntrustedContentExtension } from "./agents/untrusted-content";
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
  cwd: string; settings: ProjectShellSettings; trustedThread: boolean; agentName?: string; exactSystemPrompt?: InlineExtension; homeOnly?: string; commandDeny?: string[]; webAllowHosts?: string[]; wrapCommand?: (command: string) => string;
}): InlineExtension[] {
  const agentName = options.agentName;
  // Read at session start: a change takes effect at the next thread start.
  const secrets = agentName ? readSecrets(agentName) : {};
  const onBlock = agentName ? (line: Parameters<typeof appendAuditSafe>[1]) => appendAuditSafe(agentName, line) : undefined;
  return [
    ...(options.exactSystemPrompt ? [options.exactSystemPrompt] : []),
    createReadOnlyMcpPolicyExtension({ selection: (entries) => readSubagentSessionResources(entries)?.tools }),
    ...(options.homeOnly ? [createHomePathPolicyExtension(options.homeOnly, onBlock)] : []),
    createProjectCommandBashExtension({ cwd: options.cwd, settings: options.settings, wrapCommand: options.wrapCommand, extraEnv: secrets }),
    createUntrustedContentExtension(),
    createSecretRedactionExtension(secrets),
    ...(options.commandDeny?.length ? [createCommandPolicyExtension(options.commandDeny, onBlock)] : []),
    ...(options.webAllowHosts?.length ? [createEgressPolicyExtension(options.webAllowHosts, onBlock)] : []),
    ...(options.trustedThread && options.agentName ? [createAgentNotifyExtension({ agentName: options.agentName }), createAgentApproveExtension({ agentName: options.agentName }), createAgentDelegateExtension({ agentName: options.agentName })] : []),
  ];
}
