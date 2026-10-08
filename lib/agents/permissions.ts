import type { TriggerConfig } from "../agent-ops/trigger-store";
import { isExternalContentTool } from "./untrusted-content";
import { TOOLS_BY_PRESET, type LongTermAgent, type ToolsPreset } from "./registry";

const FILE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

export interface AgentPermissions {
  tools: string[]; preset: ToolsPreset; mcpAllowed: string[]; mcpBlockedCount: number; extensionTools: string[] | "unknown-until-start";
  env: "sanitized"; sandbox: "none" | "bubblewrap"; memory: { capture: "auto" | "off"; save: "direct" | "staged" };
  triggers: Array<{ id: string; name: string; tools: string[]; target: "thread" | "isolated" }>; commandDeny: string[]; webAllowHosts: string[] | "any";
  trifecta: { privateData: boolean; untrustedContent: boolean; exfiltration: boolean };
  /** Why each leg is set, as short English facts (tool names, "webhook trigger"); empty when the leg is off. */
  trifectaReasons: { privateData: string[]; untrustedContent: string[]; exfiltration: string[] };
  notCovered: string[];
}

type TrifectaInput = Pick<AgentPermissions, "tools" | "mcpAllowed" | "extensionTools" | "sandbox" | "webAllowHosts"> & { hasWebhookTrigger?: boolean };

/** Lethal trifecta: private data + untrusted content + a way out. Needs all three legs for an injected instruction to leak data. */
export function explainTrifecta(p: TrifectaInput): AgentPermissions["trifectaReasons"] {
  const unsandboxed = p.sandbox === "none";
  const known = Array.isArray(p.extensionTools) ? p.extensionTools : [];
  const external = [...new Set([...p.tools, ...known].filter(isExternalContentTool))];
  const privateData = unsandboxed ? p.tools.filter((t) => FILE_TOOLS.includes(t)) : [];
  const untrustedContent = [...external, ...p.mcpAllowed.map((s) => `mcp:${s}`), ...(p.hasWebhookTrigger ? ["webhook trigger"] : [])];
  const exfiltration = [...(unsandboxed && p.tools.includes("bash") ? ["bash (network)"] : []), ...(p.webAllowHosts === "any" ? external : [])];
  return { privateData, untrustedContent, exfiltration };
}

export function assessTrifecta(p: TrifectaInput): AgentPermissions["trifecta"] {
  const reasons = explainTrifecta(p);
  return { privateData: reasons.privateData.length > 0, untrustedContent: reasons.untrustedContent.length > 0, exfiltration: reasons.exfiltration.length > 0 };
}

export interface PermissionsDeps {
  configuredMcpServers: string[];
  extensionTools: string[] | "unknown-until-start";
  triggers: TriggerConfig[];
}

export function buildAgentPermissions(agent: LongTermAgent, deps: PermissionsDeps): AgentPermissions {
  const tools = [...TOOLS_BY_PRESET[agent.toolsPreset]];
  const mcpAllowed = [...agent.mcpServers];
  const webAllowHosts: AgentPermissions["webAllowHosts"] = agent.webAllowHosts?.length ? agent.webAllowHosts : "any";
  const sandbox = "none" as const;
  const triggers = deps.triggers.filter((t) => t.profile === agent.name);
  const hasWebhookTrigger = triggers.some((t) => t.webhookSecretSha256 !== undefined);
  const input = { tools, mcpAllowed, extensionTools: deps.extensionTools, sandbox, webAllowHosts, hasWebhookTrigger };
  return {
    tools, preset: agent.toolsPreset, mcpAllowed,
    mcpBlockedCount: deps.configuredMcpServers.filter((s) => !mcpAllowed.includes(s)).length,
    extensionTools: deps.extensionTools, env: "sanitized", sandbox,
    memory: { capture: agent.memoryCapture ?? "auto", save: agent.memorySave ?? "direct" },
    triggers: triggers.map((t) => ({ id: t.id, name: t.name, tools: t.tools ? [...t.tools] : [], target: t.webhookSecretSha256 !== undefined ? "isolated" : (t.runTarget ?? "thread") })),
    commandDeny: agent.commandDeny ?? [], webAllowHosts, trifecta: assessTrifecta(input), trifectaReasons: explainTrifecta(input),
    notCovered: ["MCP servers from host imports or plugins are not listed", ...(deps.extensionTools === "unknown-until-start" ? ["extension tools are known only once the thread has started"] : [])],
  };
}
