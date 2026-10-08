import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { isPathWithinRoots } from "../path-security";
import { listSubagentProfiles, listSubagentProfileSources, saveSubagentProfile, type SubagentProfile } from "../subagents";
import { NESTED_QUANTIFIER_RE } from "./command-policy";
import { pickRoadmapSettings, ROADMAP_SETTING_KEYS, type AgentRoadmapSettings } from "./roadmap-settings";
import { syncAgentMcpOverrides } from "./mcp-access";
import { PRESET_DEFAULT, PRESET_FULL, PRESET_READ_ONLY } from "../tool-presets";
import { HOST_RE } from "./egress-policy";

/** Same rule as profile names (lib/subagents.ts assertProfileName): the name is also a folder and a memory scope. */
export const AGENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const TOOLS_PRESETS = ["read-only", "standard", "full"] as const;
export type ToolsPreset = typeof TOOLS_PRESETS[number];
export const TOOLS_BY_PRESET: Record<ToolsPreset, readonly string[]> = { "read-only": PRESET_READ_ONLY, standard: PRESET_DEFAULT, full: PRESET_FULL };
const THINKING_LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EMOJI_MAX_CHARS = 8;
const ROLE_MAX_CHARS = 20_000;
const MCP_SERVERS_MAX = 100;
const MCP_SERVER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** A route segment under /api/agents (the global MCP server list) or the `requestedBy` value of the user, so no agent may take it. */
const RESERVED_AGENT_NAMES = new Set(["mcp-servers", "user"]);
export const AGENT_NAME_MAX = 64;
const compiles = (source: string) => { try { new RegExp(source); return true; } catch { return false; } };

export interface AgentAvatar { emoji: string; color: string }
export interface AgentSpaceState { name: string; avatar: AgentAvatar; createdAt: string; threadSessionId?: string; lastReadEntryId?: string }
export interface LongTermAgent extends AgentSpaceState, AgentRoadmapSettings { role: string; model?: string; thinking?: ThinkingLevel; toolsPreset: ToolsPreset; mcpServers: string[]; home: string }
export interface CreateAgentInput extends AgentRoadmapSettings { name: string; role: string; model?: string; thinking?: ThinkingLevel; toolsPreset: ToolsPreset; avatar: AgentAvatar; mcpServers?: string[] }
export type UpdateAgentInput = Partial<Omit<CreateAgentInput, "name">>;

export class AgentRegistryError extends Error {
  constructor(readonly code: "invalid" | "conflict" | "not_found", message: string) { super(message); }
}

export function agentsHomeDir(): string { return join(getAgentDir(), "agents-home"); }
export function agentSpacesDir(): string { return join(getAgentDir(), "agent-spaces"); }
export function agentHome(name: string): string { return join(agentsHomeDir(), name); }
const spacePath = (name: string) => join(agentSpacesDir(), `${name}.json`);

/** The sessions sidebar leaves these cwds out: a thread is reached through the rail only. */
export function isAgentHomePath(path: string): boolean {
  return isPathWithinRoots(path, new Set([agentsHomeDir()]));
}

export function presetFromTools(tools: readonly string[]): ToolsPreset {
  const key = [...new Set(tools)].sort().join(",");
  return TOOLS_PRESETS.find((preset) => [...TOOLS_BY_PRESET[preset]].sort().join(",") === key) ?? "standard";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function validateAvatar(value: unknown): AgentAvatar | string {
  if (!isRecord(value)) return "avatar is required";
  const { emoji, color } = value;
  if (typeof emoji !== "string" || !emoji.trim() || [...emoji].length > EMOJI_MAX_CHARS) return "avatar.emoji must be 1 to 8 characters";
  if (typeof color !== "string" || !COLOR_RE.test(color)) return "avatar.color must be #rrggbb";
  return { emoji: emoji.trim(), color: color.toLowerCase() };
}

/** Shared by create and update: every present field is checked, `name` only on create. */
function validateFields(body: Record<string, unknown>, require: boolean): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const input: Record<string, unknown> = {};
  if ("role" in body || require) {
    if (typeof body.role !== "string" || !body.role.trim()) return fail("role is required");
    if (body.role.length > ROLE_MAX_CHARS) return fail(`role must be at most ${ROLE_MAX_CHARS} characters`);
    input.role = body.role.trim();
  }
  if ("toolsPreset" in body || require) {
    if (!(TOOLS_PRESETS as readonly unknown[]).includes(body.toolsPreset)) return fail(`toolsPreset must be one of ${TOOLS_PRESETS.join(", ")}`);
    input.toolsPreset = body.toolsPreset;
  }
  if ("avatar" in body || require) {
    const avatar = validateAvatar(body.avatar);
    if (typeof avatar === "string") return fail(avatar);
    input.avatar = avatar;
  }
  if ("model" in body) {
    if (body.model !== undefined && body.model !== null && typeof body.model !== "string") return fail("model must be a string");
    input.model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  }
  if ("thinking" in body) {
    if (body.thinking !== undefined && body.thinking !== null && !(typeof body.thinking === "string" && THINKING_LEVELS.has(body.thinking))) return fail("thinking must be a reasoning level");
    input.thinking = typeof body.thinking === "string" ? body.thinking : undefined;
  }
  if ("mcpServers" in body) {
    const list = body.mcpServers;
    if (!Array.isArray(list) || list.length > MCP_SERVERS_MAX || !list.every((entry) => typeof entry === "string" && MCP_SERVER_NAME_RE.test(entry))) return fail("mcpServers must be a list of server names");
    input.mcpServers = [...new Set(list as string[])];
  }
  if ("memoryCapture" in body) { if (body.memoryCapture != null && body.memoryCapture !== "auto" && body.memoryCapture !== "off") return fail("memoryCapture must be auto or off"); input.memoryCapture = body.memoryCapture ?? undefined; }
  if ("memoryHint" in body) { if (body.memoryHint != null && (typeof body.memoryHint !== "string" || body.memoryHint.length > 500)) return fail("memoryHint must be at most 500 characters"); input.memoryHint = typeof body.memoryHint === "string" && body.memoryHint.trim() ? body.memoryHint.trim() : undefined; }
  if ("memoryRecallLimit" in body) { if (body.memoryRecallLimit != null && (!Number.isInteger(body.memoryRecallLimit) || (body.memoryRecallLimit as number) < 0 || (body.memoryRecallLimit as number) > 20)) return fail("memoryRecallLimit must be an integer from 0 to 20"); input.memoryRecallLimit = body.memoryRecallLimit ?? undefined; }
  if ("memoryRecallThreshold" in body) { if (body.memoryRecallThreshold != null && (typeof body.memoryRecallThreshold !== "number" || body.memoryRecallThreshold < 0 || body.memoryRecallThreshold > 1)) return fail("memoryRecallThreshold must be between 0 and 1"); input.memoryRecallThreshold = body.memoryRecallThreshold ?? undefined; }
  if ("memorySave" in body) { if (body.memorySave != null && body.memorySave !== "direct" && body.memorySave !== "staged") return fail("memorySave must be direct or staged"); input.memorySave = body.memorySave ?? undefined; }
  if ("acceptsDelegation" in body) { if (body.acceptsDelegation != null && typeof body.acceptsDelegation !== "boolean") return fail("acceptsDelegation must be a boolean"); input.acceptsDelegation = body.acceptsDelegation ?? undefined; }
  if ("budgetTokensPerDay" in body) { if (body.budgetTokensPerDay != null && (!Number.isInteger(body.budgetTokensPerDay) || (body.budgetTokensPerDay as number) < 0)) return fail("budgetTokensPerDay must be an integer >= 0"); input.budgetTokensPerDay = body.budgetTokensPerDay ?? undefined; }
  if ("budgetUsdPerDay" in body) { if (body.budgetUsdPerDay != null && (typeof body.budgetUsdPerDay !== "number" || body.budgetUsdPerDay < 0)) return fail("budgetUsdPerDay must be a number >= 0"); input.budgetUsdPerDay = body.budgetUsdPerDay ?? undefined; }
  if ("commandDeny" in body) {
    const list = body.commandDeny ?? [];
    if (!Array.isArray(list) || list.length > 50 || !list.every((p) => typeof p === "string" && p.length <= 200 && compiles(p))) return fail("commandDeny must be a list of at most 50 valid regular expressions");
    if ((list as string[]).some((p) => NESTED_QUANTIFIER_RE.test(p))) return fail("commandDeny patterns must not nest quantifiers (a group ending in + or * that is itself quantified, like (a+)+)");
    input.commandDeny = list.length ? [...new Set(list as string[])] : undefined;
  }
  if ("webAllowHosts" in body) {
    const list = body.webAllowHosts ?? [];
    if (!Array.isArray(list) || list.length > 100 || !list.every((h) => typeof h === "string" && HOST_RE.test(h))) return fail("webAllowHosts must be a list of host names (example.com or *.example.com)");
    input.webAllowHosts = list.length ? [...new Set((list as string[]).map((h) => h.toLowerCase()))] : undefined;
  }
  if ("sandbox" in body) { if (body.sandbox != null && body.sandbox !== "none" && body.sandbox !== "bubblewrap") return fail("sandbox must be none or bubblewrap"); input.sandbox = body.sandbox ?? undefined; }
  if ("sandboxNetwork" in body) { if (body.sandboxNetwork != null && typeof body.sandboxNetwork !== "boolean") return fail("sandboxNetwork must be a boolean"); input.sandboxNetwork = body.sandboxNetwork ?? undefined; }
  return { ok: true, input };
}

const KNOWN_FIELDS = new Set(["name", "role", "model", "thinking", "toolsPreset", "avatar", "mcpServers", ...ROADMAP_SETTING_KEYS]);

export function validateCreateInput(body: unknown): { ok: true; input: CreateAgentInput } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Invalid JSON body" };
  if (typeof body.name !== "string" || !AGENT_NAME_RE.test(body.name.trim())) return { ok: false, error: "name may contain only letters, numbers, dots, underscores and hyphens" };
  if (body.name.trim().length > AGENT_NAME_MAX) return { ok: false, error: `name must be at most ${AGENT_NAME_MAX} characters` };
  if (body.name.includes("..")) return { ok: false, error: "name must not contain two consecutive dots" };
  if (RESERVED_AGENT_NAMES.has(body.name.trim().toLowerCase())) return { ok: false, error: "name is reserved" };
  const fields = validateFields(body, true);
  if (!fields.ok) return fields;
  return { ok: true, input: { name: body.name.trim(), ...fields.input } as CreateAgentInput };
}

export function validateUpdateInput(body: unknown): { ok: true; input: UpdateAgentInput } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Invalid JSON body" };
  const unknown = Object.keys(body).find((key) => !KNOWN_FIELDS.has(key) || key === "name");
  if (unknown) return { ok: false, error: `unknown field: ${unknown}` };
  const fields = validateFields(body, false);
  return fields.ok ? { ok: true, input: fields.input as UpdateAgentInput } : fields;
}

function readSpace(name: string): AgentSpaceState | null {
  try {
    const raw = JSON.parse(readFileSync(spacePath(name), "utf8")) as Partial<AgentSpaceState>;
    const avatar = validateAvatar(raw.avatar);
    if (raw.name !== name || typeof avatar === "string" || typeof raw.createdAt !== "string") return null;
    return {
      name, avatar, createdAt: raw.createdAt,
      ...(typeof raw.threadSessionId === "string" ? { threadSessionId: raw.threadSessionId } : {}),
      ...(typeof raw.lastReadEntryId === "string" ? { lastReadEntryId: raw.lastReadEntryId } : {}),
    };
  } catch { return null; }
}

function writeSpace(space: AgentSpaceState): void {
  mkdirSync(agentSpacesDir(), { recursive: true, mode: 0o700 });
  writePrivateFileAtomicSync(spacePath(space.name), JSON.stringify(space, null, 2));
}

/** Global profiles only: the home folder is the cwd, and nothing under it may define project profiles. */
function longTermProfiles(): SubagentProfile[] {
  return listSubagentProfiles(agentsHomeDir()).filter((profile) => profile.scope === "global" && profile.longTerm === true);
}

/** Exact-name lookup of the global long-term profile: trusted threads never resolve through a project scope. */
export function resolveLongTermProfile(name: string): SubagentProfile | undefined {
  return longTermProfiles().find((profile) => profile.name === name && profile.enabled !== false);
}

function toAgent(profile: SubagentProfile): LongTermAgent {
  // A missing or malformed space file (manual edit) must not hide the agent: fall back to a neutral avatar.
  const space = readSpace(profile.name) ?? { name: profile.name, avatar: { emoji: profile.name[0].toUpperCase(), color: "#555555" }, createdAt: "" };
  return {
    ...space, role: profile.systemPrompt, toolsPreset: presetFromTools(profile.tools), mcpServers: profile.mcpServers ?? [], home: agentHome(profile.name),
    ...(profile.model ? { model: profile.model } : {}), ...(profile.thinking ? { thinking: profile.thinking } : {}),
    ...pickRoadmapSettings(profile),
  };
}

export function listLongTermAgents(): LongTermAgent[] {
  return longTermProfiles().map(toAgent).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getLongTermAgent(name: string): LongTermAgent | null {
  if (!AGENT_NAME_RE.test(name)) return null;
  const profile = longTermProfiles().find((candidate) => candidate.name === name);
  return profile ? toAgent(profile) : null;
}

function writeProfile(input: CreateAgentInput, color: string): void {
  // loadExtensions explicitly true (pi-mem0 is an extension; built-ins default to false); no extensionTools list, so a
  // trusted thread gets every loaded extension tool like a normal session. Skills load too, like a normal session.
  syncAgentMcpOverrides(agentHome(input.name), input.mcpServers ?? []); // first: a sync failure must leave no profile behind (the create catch removes home and space only)
  saveSubagentProfile(agentHome(input.name), "global", {
    name: input.name, displayName: input.name, description: `Long-term agent ${input.name}`, systemPrompt: input.role,
    tools: [...TOOLS_BY_PRESET[input.toolsPreset]], loadSkills: true, loadExtensions: true,
    ...(input.model ? { model: input.model } : {}), ...(input.thinking ? { thinking: input.thinking } : {}),
    inheritContext: false, runInBackground: false, promptMode: "append", color, enabled: true, longTerm: true,
    ...(input.mcpServers?.length ? { mcpServers: input.mcpServers } : {}),
    ...pickRoadmapSettings(input),
  });
}

/** The agent keeps its durable facts here; the profile prompt only points at it (MEMORY_MD_INSTRUCTION). Never overwrites. */
export function writeMemoryMd(home: string, name: string): void {
  const header = [`# ${name} memory`, "", "One line per fact you want to keep across tasks. Keep it short; put details in notes/.",
    "Rule: read this file at the start of a task; update it when something durable changed.", "", "## Facts", ""].join("\n");
  try { writeFileSync(join(home, "MEMORY.md"), header, { flag: "wx", mode: 0o600 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

export function createLongTermAgent(input: CreateAgentInput): LongTermAgent {
  const name = input.name.trim();
  if (!AGENT_NAME_RE.test(name) || name.length > AGENT_NAME_MAX) throw new AgentRegistryError("invalid", "invalid agent name");
  // Any profile of any scope, in any case: resolveSubagentProfile is case-insensitive, and a built-in must not be shadowed.
  const taken = listSubagentProfileSources(agentsHomeDir()).some((profile) => profile.name.toLowerCase() === name.toLowerCase());
  if (taken || existsSync(agentHome(name)) || existsSync(spacePath(name))) throw new AgentRegistryError("conflict", `name already used: ${name}`);
  mkdirSync(agentsHomeDir(), { recursive: true, mode: 0o700 });
  mkdirSync(agentHome(name), { mode: 0o700 });
  writeSpace({ name, avatar: input.avatar, createdAt: new Date().toISOString() });
  try {
    writeMemoryMd(agentHome(name), name);
    writeProfile({ ...input, name }, input.avatar.color); // last: the profile is what lists the agent
  } catch (error) {
    rmSync(agentHome(name), { recursive: true, force: true }); // just created, so at most MEMORY.md: a leftover would block the name for good
    rmSync(spacePath(name), { force: true });
    throw error;
  }
  return getLongTermAgent(name)!;
}

export function updateLongTermAgent(name: string, patch: UpdateAgentInput): LongTermAgent {
  const current = getLongTermAgent(name);
  if (!current) throw new AgentRegistryError("not_found", `agent not found: ${name}`);
  const next: CreateAgentInput = {
    name, role: patch.role ?? current.role, toolsPreset: patch.toolsPreset ?? current.toolsPreset, avatar: patch.avatar ?? current.avatar,
    model: "model" in patch ? patch.model : current.model, thinking: "thinking" in patch ? patch.thinking : current.thinking,
    mcpServers: "mcpServers" in patch ? patch.mcpServers : current.mcpServers,
    ...pickRoadmapSettings(Object.fromEntries(ROADMAP_SETTING_KEYS.map((key) => [key, key in patch ? patch[key] : current[key]]))),
  };
  if (patch.avatar) writeSpace({ ...(readSpace(name) ?? { name, createdAt: new Date().toISOString(), avatar: next.avatar }), avatar: patch.avatar });
  writeProfile(next, next.avatar.color);
  return getLongTermAgent(name)!;
}

function patchSpace(name: string, patch: Partial<AgentSpaceState>): void {
  const space = readSpace(name);
  if (!space) throw new AgentRegistryError("not_found", `agent space not found: ${name}`);
  writeSpace({ ...space, ...patch });
}
export function setThreadSessionId(name: string, sessionId: string): void { patchSpace(name, { threadSessionId: sessionId }); }
export function setLastReadEntryId(name: string, entryId: string): void { patchSpace(name, { lastReadEntryId: entryId }); }

/** Reversible by hand like delete: the thread file moves under .trash and the space forgets it, so the next open starts fresh. Returns the trash directory, or null when there was no file to move. */
export function archiveThread(name: string, threadPath: string | undefined): string | null {
  const space = readSpace(name);
  if (!space || !getLongTermAgent(name)) throw new AgentRegistryError("not_found", `agent not found: ${name}`);
  let trash: string | null = null;
  if (threadPath && existsSync(threadPath)) {
    trash = join(agentSpacesDir(), ".trash", `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    mkdirSync(trash, { recursive: true, mode: 0o700 });
    renameSync(threadPath, join(trash, "thread.jsonl"));
  }
  writeSpace({ name, avatar: space.avatar, createdAt: space.createdAt });
  return trash;
}

/** Reversible by hand: home and thread move under .trash; profile and space state are removed. Returns the trash directory. */
export function deleteLongTermAgent(name: string, threadPath?: string): string {
  const profile = longTermProfiles().find((candidate) => candidate.name === name);
  if (!profile) throw new AgentRegistryError("not_found", `agent not found: ${name}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trash = join(agentSpacesDir(), ".trash", `${name}-${stamp}`);
  mkdirSync(trash, { recursive: true, mode: 0o700 });
  if (existsSync(agentHome(name))) renameSync(agentHome(name), join(trash, "home"));
  if (threadPath && existsSync(threadPath)) renameSync(threadPath, join(trash, "thread.jsonl"));
  if (profile.filePath) unlinkSync(profile.filePath);
  try { unlinkSync(spacePath(name)); } catch { /* already gone */ }
  return trash;
}
