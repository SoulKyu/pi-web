import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "../atomic-file";
import { isPathWithinRoots } from "../path-security";
import { listSubagentProfiles, listSubagentProfileSources, saveSubagentProfile, type SubagentProfile } from "../subagents";
import { PRESET_DEFAULT, PRESET_FULL, PRESET_READ_ONLY } from "../tool-presets";

/** Same rule as profile names (lib/subagents.ts assertProfileName): the name is also a folder and a memory scope. */
export const AGENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const TOOLS_PRESETS = ["read-only", "standard", "full"] as const;
export type ToolsPreset = typeof TOOLS_PRESETS[number];
export const TOOLS_BY_PRESET: Record<ToolsPreset, readonly string[]> = { "read-only": PRESET_READ_ONLY, standard: PRESET_DEFAULT, full: PRESET_FULL };
const THINKING_LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EMOJI_MAX_CHARS = 8;
const ROLE_MAX_CHARS = 20_000;
export const AGENT_NAME_MAX = 64;

export interface AgentAvatar { emoji: string; color: string }
export interface AgentSpaceState { name: string; avatar: AgentAvatar; createdAt: string; threadSessionId?: string; lastReadEntryId?: string }
export interface LongTermAgent extends AgentSpaceState { role: string; model?: string; thinking?: ThinkingLevel; toolsPreset: ToolsPreset; home: string }
export interface CreateAgentInput { name: string; role: string; model?: string; thinking?: ThinkingLevel; toolsPreset: ToolsPreset; avatar: AgentAvatar }
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
  return { ok: true, input };
}

const KNOWN_FIELDS = new Set(["name", "role", "model", "thinking", "toolsPreset", "avatar"]);

export function validateCreateInput(body: unknown): { ok: true; input: CreateAgentInput } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Invalid JSON body" };
  if (typeof body.name !== "string" || !AGENT_NAME_RE.test(body.name.trim())) return { ok: false, error: "name may contain only letters, numbers, dots, underscores and hyphens" };
  if (body.name.trim().length > AGENT_NAME_MAX) return { ok: false, error: `name must be at most ${AGENT_NAME_MAX} characters` };
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
    ...space, role: profile.systemPrompt, toolsPreset: presetFromTools(profile.tools), home: agentHome(profile.name),
    ...(profile.model ? { model: profile.model } : {}), ...(profile.thinking ? { thinking: profile.thinking } : {}),
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
  saveSubagentProfile(agentHome(input.name), "global", {
    name: input.name, displayName: input.name, description: `Long-term agent ${input.name}`, systemPrompt: input.role,
    tools: [...TOOLS_BY_PRESET[input.toolsPreset]], loadSkills: true, loadExtensions: true,
    ...(input.model ? { model: input.model } : {}), ...(input.thinking ? { thinking: input.thinking } : {}),
    inheritContext: false, runInBackground: false, promptMode: "append", color, enabled: true, longTerm: true,
  });
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
    writeProfile({ ...input, name }, input.avatar.color); // last: the profile is what lists the agent
  } catch (error) {
    rmSync(agentHome(name), { recursive: true, force: true }); // just created, so empty: a leftover would block the name for good
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
