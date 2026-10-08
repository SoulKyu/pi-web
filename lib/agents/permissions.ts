import type { TriggerConfig } from "../agent-ops/trigger-store";
import { bwrapAvailable } from "./sandbox";
import { listSecretNames } from "./secrets";
import { isExternalContentTool } from "./untrusted-content";
import { TOOLS_BY_PRESET, type LongTermAgent, type ToolsPreset } from "./registry";

const SEARCH_FETCH_TOOLS = new Set(["web_search", "source_check"]);
const FILE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

export interface AgentPermissions {
  tools: string[]; preset: ToolsPreset; mcpAllowed: string[]; mcpBlockedCount: number; extensionTools: string[] | "unknown-until-start";
  env: "sanitized"; sandbox: "none" | "bubblewrap"; memory: { capture: "auto" | "off"; save: "direct" | "staged" };
  triggers: Array<{ id: string; name: string; tools: string[]; target: "thread" | "isolated" }>; commandDeny: string[]; webAllowHosts: string[] | "any"; /** Names only: injected into the agent's bash. */ secrets: string[];
  trifecta: { privateData: boolean; untrustedContent: boolean; exfiltration: boolean };
  /** Why each leg is set, as short English facts (tool names, "webhook trigger"); empty when the leg is off. */
  trifectaReasons: { privateData: string[]; untrustedContent: string[]; exfiltration: string[] };
  notCovered: string[];
}

type TrifectaInput = Pick<AgentPermissions, "tools" | "mcpAllowed" | "extensionTools" | "sandbox" | "webAllowHosts"> & { hasWebhookTrigger?: boolean; sandboxNetwork?: boolean };

/** Lethal trifecta: private data + untrusted content + a way out. Needs all three legs for an injected instruction to leak data. */
export function explainTrifecta(p: TrifectaInput): AgentPermissions["trifectaReasons"] {
  const unsandboxed = p.sandbox === "none";
  const known = Array.isArray(p.extensionTools) ? p.extensionTools : [];
  const external = [...new Set([...p.tools, ...known].filter(isExternalContentTool))];
  // The sandbox wraps bash only: read, grep, find, ls, edit and write still reach ~/.ssh.
  const privateData = p.tools.filter((t) => FILE_TOOLS.includes(t) && (unsandboxed || t !== "bash"));
  const mcpServers = p.mcpAllowed.map((s) => `mcp:${s}`);
  const untrustedContent = [...external, ...mcpServers, ...(p.hasWebhookTrigger ? ["webhook trigger"] : [])];
  // web_search / source_check fetch result pages from any host, and an MCP server sends anywhere: neither is narrowed by webAllowHosts.
  const exfiltration = [
    ...((unsandboxed || p.sandboxNetwork) && p.tools.includes("bash") ? ["bash (network)"] : []),
    ...external.filter((t) => p.webAllowHosts === "any" || SEARCH_FETCH_TOOLS.has(t)),
    ...mcpServers,
    ...(p.extensionTools === "unknown-until-start" && p.webAllowHosts === "any" ? ["extension tools unknown"] : []),
  ];
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
  /** Whether bwrap is installed; read from PATH when omitted. */
  sandboxAvailable?: boolean;
  /** Secret names of the agent; read from the vault when omitted. */
  secretNames?: string[];
}

export function buildAgentPermissions(agent: LongTermAgent, deps: PermissionsDeps): AgentPermissions {
  const tools = [...TOOLS_BY_PRESET[agent.toolsPreset]];
  const mcpAllowed = [...agent.mcpServers];
  const webAllowHosts: AgentPermissions["webAllowHosts"] = agent.webAllowHosts?.length ? agent.webAllowHosts : "any";
  // The effective sandbox: a profile asking for bubblewrap without the binary runs bash unsandboxed.
  const sandbox = agent.sandbox === "bubblewrap" && (deps.sandboxAvailable ?? bwrapAvailable() !== null) ? "bubblewrap" as const : "none" as const;
  const triggers = deps.triggers.filter((t) => t.profile === agent.name);
  const hasWebhookTrigger = triggers.some((t) => t.webhookSecretSha256 !== undefined);
  const sandboxNetwork = sandbox === "bubblewrap" && agent.sandboxNetwork === true;
  const input = { tools, mcpAllowed, extensionTools: deps.extensionTools, sandbox, webAllowHosts, hasWebhookTrigger, sandboxNetwork };
  return {
    tools, preset: agent.toolsPreset, mcpAllowed,
    mcpBlockedCount: deps.configuredMcpServers.filter((s) => !mcpAllowed.includes(s)).length,
    extensionTools: deps.extensionTools, env: "sanitized", sandbox,
    memory: { capture: agent.memoryCapture ?? "auto", save: agent.memorySave ?? "direct" },
    triggers: triggers.map((t) => ({ id: t.id, name: t.name, tools: t.tools ? [...t.tools] : [], target: t.webhookSecretSha256 !== undefined ? "isolated" : (t.runTarget ?? "thread") })),
    commandDeny: agent.commandDeny ?? [], secrets: deps.secretNames ?? listSecretNames(agent.name), webAllowHosts, trifecta: assessTrifecta(input), trifectaReasons: explainTrifecta(input),
    notCovered: ["MCP servers from host imports or plugins are not listed", ...(deps.extensionTools === "unknown-until-start" ? ["extension tools are known only once the thread has started"] : [])],
  };
}
