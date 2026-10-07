/** Per-agent settings read by later roadmap features; each is a profile frontmatter key (ROADMAP_PROFILE_KEYS in lib/subagents.ts). Client-safe. */
export interface AgentRoadmapSettings {
  memoryCapture?: "auto" | "off"; memoryHint?: string; memoryRecallLimit?: number; memoryRecallThreshold?: number; memorySave?: "direct" | "staged";
  acceptsDelegation?: boolean; budgetTokensPerDay?: number; budgetUsdPerDay?: number; commandDeny?: string[]; webAllowHosts?: string[];
}
export const ROADMAP_SETTING_KEYS = ["memoryCapture", "memoryHint", "memoryRecallLimit", "memoryRecallThreshold", "memorySave", "acceptsDelegation", "budgetTokensPerDay", "budgetUsdPerDay", "commandDeny", "webAllowHosts"] as const satisfies readonly (keyof AgentRoadmapSettings)[];
export const pickRoadmapSettings = (source: AgentRoadmapSettings): AgentRoadmapSettings =>
  Object.fromEntries(ROADMAP_SETTING_KEYS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
