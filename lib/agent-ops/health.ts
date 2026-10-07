export interface AgentOpsHealth {
  lastTickAt: string | null;
  running: { isolated: number; thread: number };
  sessionsAlive: number;
  freeMb: number | null;
  extensionErrors: Array<{ sessionId: string; key: string; text: string }>;
  paused: boolean;
}

const TICK_STALE_MS = 3 * 60_000;
const LOW_FREE_MB = 1500;

export function collectHealth(deps: { lastTick?: number; running: { isolated: number; thread: number }; sessionsAlive: number; freeMb?: number; extensionErrors: AgentOpsHealth["extensionErrors"]; paused: boolean }): AgentOpsHealth {
  return {
    lastTickAt: deps.lastTick === undefined ? null : new Date(deps.lastTick).toISOString(),
    running: deps.running,
    sessionsAlive: deps.sessionsAlive,
    freeMb: deps.freeMb ?? null,
    extensionErrors: deps.extensionErrors,
    paused: deps.paused,
  };
}

/** `down`: the scheduler has not ticked for 3 min. No tick yet is `warn`: the first tick comes 60 s after start. */
export function healthLevel(health: AgentOpsHealth, now = Date.now()): "ok" | "warn" | "down" {
  if (health.lastTickAt !== null && now - Date.parse(health.lastTickAt) > TICK_STALE_MS) return "down";
  if (health.lastTickAt === null || health.extensionErrors.length > 0 || health.paused || (health.freeMb !== null && health.freeMb < LOW_FREE_MB)) return "warn";
  return "ok";
}
