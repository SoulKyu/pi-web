import type { AgentOpsHealth } from "@/lib/agent-ops/health";
import type { TranslationParams } from "@/lib/i18n/types";

type Translate = (key: string, params?: TranslationParams) => string;

const GAP = 8;
const MARGIN = 8;

/** What the rail health popover says, one line per fact; gauges the server did not send are left out. */
export function healthPopoverLines(
  state: { health: AgentOpsHealth; level: "ok" | "warn" | "down" } | null,
  extras: { pauseError: string | null; staleTime: string | null },
  t: Translate,
  formatTime: (iso: string) => string,
): string[] {
  const lines: string[] = [];
  if (state) {
    const { health } = state;
    lines.push(t(`agents.health.${state.level}`));
    lines.push(t("agents.health.lastTick", { time: health.lastTickAt ? formatTime(health.lastTickAt) : "–" }));
    lines.push(t("agents.health.running", { isolated: health.running.isolated, thread: health.running.thread }));
    lines.push(t("agents.health.freeMemory", { freeMb: health.freeMb ?? "–" }));
    if (typeof health.sessionsAlive === "number") lines.push(t("agents.health.sessions", { count: health.sessionsAlive }));
    if (health.quietHours) lines.push(t("agentOps.quietHours.active"));
    const extensionError = health.extensionErrors[0]?.text;
    if (extensionError) lines.push(t("agents.health.extensionError", { text: extensionError }));
  }
  if (extras.pauseError) lines.push(t("agents.error", { error: extras.pauseError }));
  if (extras.staleTime) lines.push(t("agents.rail.stale", { time: extras.staleTime }));
  return lines;
}

/** Fixed position beside the rail button: right of the vertical rail, below the horizontal one, kept MARGIN px inside the viewport. */
export function healthPopoverPosition(
  anchor: { top: number; right: number; bottom: number; left: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  orientation: "vertical" | "horizontal",
): { top: number; left: number } {
  const top = orientation === "vertical" ? anchor.top : anchor.bottom + GAP;
  const left = orientation === "vertical" ? anchor.right + GAP : anchor.left;
  const clamp = (value: number, extent: number, limit: number) => Math.max(MARGIN, Math.min(value, limit - extent - MARGIN));
  return { top: clamp(top, size.height, viewport.height), left: clamp(left, size.width, viewport.width) };
}
