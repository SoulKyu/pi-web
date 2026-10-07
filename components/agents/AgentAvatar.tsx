"use client";

import { unreadLabel } from "@/lib/agents/agent-view";
import type { AgentState } from "@/lib/agents/agent-view";
import type { AgentAvatar as Avatar } from "@/lib/agents/registry";

export function AgentAvatar({ avatar, size = 28, running = false, state, unread = 0, selected = false, title }: { avatar: Avatar; size?: number; running?: boolean; state?: AgentState; unread?: number; selected?: boolean; title?: string }) {
  const badge = unreadLabel(unread);
  return (
    <span title={title} aria-hidden style={{ position: "relative", width: size, height: size, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: avatar.color, color: "#fff", fontSize: Math.round(size * 0.46), fontWeight: 700, outline: selected ? "2px solid var(--accent)" : "none", outlineOffset: 2, flexShrink: 0 }}>
      {avatar.emoji}
      {badge && <span className="agent-badge">{badge}</span>}
      {state === "needs_input" ? <span className="agent-running-dot agent-dot-needs-input" /> : state === "failed" ? <span className="agent-running-dot agent-dot-failed" /> : running && <span className="agent-running-dot" />}
    </span>
  );
}
