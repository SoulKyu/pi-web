import { closeSync, openSync, readSync, statSync } from "node:fs";
import { AGENT_PROFILE_SESSION_TYPE } from "../subagents";

export interface AgentSessionRef {
  id: string; path: string; name?: string; created: string; modified: string; cwd: string; agentProfile: string;
}
/** Client-safe card: explicit allowlist, no systemPrompt/tools/filePath. */
export interface AgentCard {
  profile: string; displayName: string; description: string; color?: string; enabled: boolean;
  sessions: AgentSessionRef[]; running: boolean; lastActivity?: string;
}

// Fingerprint cache: session files are scanned on every board poll; skip unchanged ones.
const refCache = new Map<string, { fp: string; ref: { profile: string; createdAt: string } | null }>();

/** Mirrors agentProfileMetadataData (lib/subagents.ts:544): the entry carries data, not metadata. */
export function readAgentProfileRef(filePath: string, maxBytes = 64 * 1024): { profile: string; createdAt: string } | null {
  let fp = "";
  try {
    const st = statSync(filePath);
    fp = `${st.size}:${st.mtimeMs}`;
    const cached = refCache.get(filePath);
    if (cached && cached.fp === fp) return cached.ref;
  } catch { return null; }
  let ref: { profile: string; createdAt: string } | null = null;
  try {
    const fd = openSync(filePath, "r"); // inside try: file may vanish between listing and read
    try {
      const buffer = Buffer.allocUnsafe(maxBytes);
      const bytes = readSync(fd, buffer, 0, buffer.length, 0);
      for (const line of bytes > 0 ? buffer.subarray(0, bytes).toString("utf8").split("\n") : []) {
        if (!line.includes(AGENT_PROFILE_SESSION_TYPE)) continue;
        try {
          const entry = JSON.parse(line) as { customType?: string; data?: { version?: unknown; profile?: unknown; createdAt?: unknown } };
          if (entry.customType !== AGENT_PROFILE_SESSION_TYPE) continue;
          if (entry.data?.version === 1 && typeof entry.data.profile === "string") {
            ref = { profile: entry.data.profile, createdAt: String(entry.data.createdAt ?? "") };
            break;
          }
        } catch { /* malformed line */ }
      }
    } finally { closeSync(fd); }
  } catch { return null; }
  refCache.set(filePath, { fp, ref });
  return ref;
}

export function buildAgentCards(input: {
  profiles: readonly { name: string; displayName: string; description: string; color?: string; enabled: boolean }[];
  sessions: readonly AgentSessionRef[];
  runningSessionIds: ReadonlySet<string>;
}): AgentCard[] {
  const byProfile = new Map<string, AgentSessionRef[]>();
  for (const s of input.sessions) {
    const list = byProfile.get(s.agentProfile) ?? [];
    list.push(s);
    byProfile.set(s.agentProfile, list);
  }
  const cards: AgentCard[] = input.profiles.map((p) => {
    const sessions = (byProfile.get(p.name) ?? []).sort((a, b) => b.modified.localeCompare(a.modified));
    return {
      profile: p.name, displayName: p.displayName, description: p.description, color: p.color, enabled: p.enabled,
      sessions, running: sessions.some((s) => input.runningSessionIds.has(s.id)), lastActivity: sessions[0]?.modified,
    };
  });
  for (const [name, sessions] of byProfile) {
    if (input.profiles.some((p) => p.name === name)) continue;
    cards.push({ profile: name, displayName: name, description: "Profile no longer defined", enabled: false, sessions, running: sessions.some((s) => input.runningSessionIds.has(s.id)), lastActivity: sessions[0]?.modified });
  }
  return cards.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}
