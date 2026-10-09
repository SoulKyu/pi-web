import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { appendAuditSafe, blockLine } from "./agents/audit";
import type { AuditPolicy, BlockEvent } from "./agents/audit-types";
import { createAgentApproveExtension } from "./agents/agent-approve";
import { createAgentDelegateExtension } from "./agents/agent-delegate";
import { createAgentNotifyExtension } from "./agents/agent-notify";
import { createAgentRemindExtension } from "./agents/agent-remind";
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
  cwd: string; settings: ProjectShellSettings; trustedThread: boolean; agentName?: string; /** The snapshot profile is a long-term agent: only then do the vault and the audit journal apply (a project subagent file may reuse the name). */ longTerm?: boolean; exactSystemPrompt?: InlineExtension; homeOnly?: string; commandDeny?: string[]; webAllowHosts?: string[]; wrapCommand?: (command: string) => string;
}): InlineExtension[] {
  const agentName = options.agentName;
  // Read at session start: a change takes effect at the next thread start.
  // Long-term agents only: a built-in subagent profile sharing a name never gets them. A bad file must not break the start.
  const longTermName = options.longTerm === true ? agentName : undefined;
  let secrets: Record<string, string> = {};
  try { if (longTermName) secrets = readSecrets(longTermName); } catch (error) { console.warn("[agent-secrets]", error instanceof Error ? error.message : error); }
  const onBlock = longTermName ? (policy: AuditPolicy, event: BlockEvent) => appendAuditSafe(longTermName, blockLine(policy, event, secrets)) : undefined;
  return [
    ...(options.exactSystemPrompt ? [options.exactSystemPrompt] : []),
    createReadOnlyMcpPolicyExtension({ selection: (entries) => readSubagentSessionResources(entries)?.tools }),
    ...(options.homeOnly ? [createHomePathPolicyExtension(options.homeOnly, onBlock)] : []),
    createProjectCommandBashExtension({ cwd: options.cwd, settings: options.settings, wrapCommand: options.wrapCommand, extraEnv: secrets }),
    createUntrustedContentExtension(),
    createSecretRedactionExtension(secrets),
    ...(options.commandDeny?.length ? [createCommandPolicyExtension(options.commandDeny, onBlock)] : []),
    ...(options.webAllowHosts?.length ? [createEgressPolicyExtension(options.webAllowHosts, onBlock)] : []),
    ...(options.trustedThread && options.agentName ? [createAgentNotifyExtension({ agentName: options.agentName }), createAgentApproveExtension({ agentName: options.agentName }), createAgentDelegateExtension({ agentName: options.agentName }), createAgentRemindExtension({ agentName: options.agentName })] : []),
  ];
}
