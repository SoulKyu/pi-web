export interface RailShortcutAgent {
  name: string;
  unread: number;
}

interface RailShortcutKeys {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Next (1) or previous (-1) agent with unread entries after the active one, in rail order, wrapping; null when none. */
export function nextUnreadAgent(agents: readonly RailShortcutAgent[], active: string | null, direction: 1 | -1): string | null {
  const count = agents.length;
  const from = agents.findIndex((agent) => agent.name === active);
  for (let step = 1; step <= count; step += 1) {
    const agent = agents[(((from < 0 ? (direction === 1 ? -1 : 0) : from) + direction * step) % count + count) % count];
    if (agent.unread > 0) return agent.name;
  }
  return null;
}

/** The n-th agent of the rail, 1-based. */
export function nthAgent(agents: readonly RailShortcutAgent[], n: number): string | null {
  return agents[n - 1]?.name ?? null;
}

/** Alt+ArrowDown/Up: next/previous unread agent; Ctrl+Alt+1..9: the n-th agent. Null for any other key or no target. */
export function railShortcutTarget(event: RailShortcutKeys, agents: readonly RailShortcutAgent[], active: string | null): string | null {
  if (event.metaKey || event.shiftKey || !event.altKey) return null;
  if (!event.ctrlKey) {
    if (event.key === "ArrowDown") return nextUnreadAgent(agents, active, 1);
    if (event.key === "ArrowUp") return nextUnreadAgent(agents, active, -1);
    return null;
  }
  // `code` first: Alt can turn `key` into another character on macOS layouts.
  const digit = /^Digit([1-9])$/.exec(event.code ?? "")?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : null);
  return digit ? nthAgent(agents, Number(digit)) : null;
}
