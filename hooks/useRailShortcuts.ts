"use client";

import { useEffect } from "react";
import { railShortcutTarget, type RailShortcutAgent } from "@/lib/agents/rail-shortcuts";

/**
 * Rail shortcuts: Alt+ArrowDown/Up open the next/previous agent with unread entries,
 * Ctrl+Alt+1..9 the n-th agent (Firefox on Linux keeps Alt+digit for tabs). They work from
 * the composer (they edit no text) but not under a dialog, and swallow the key only when handled.
 */
export function useRailShortcuts(agents: readonly RailShortcutAgent[], activeAgent: string | null, onOpenAgent: (name: string) => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const target = railShortcutTarget(e, agents, activeAgent);
      if (!target || target === activeAgent) return;
      e.preventDefault();
      onOpenAgent(target);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [agents, activeAgent, onOpenAgent]);
}
