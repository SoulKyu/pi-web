"use client";

import { HexAvatar } from "@/components/tron";
import { cn } from "@/lib/cn";
import { unreadLabel } from "@/lib/agents/agent-view";
import type { AgentState } from "@/lib/agents/agent-view";
import type { AgentAvatar as Avatar } from "@/lib/agents/registry";

export function AgentAvatar({ avatar, size = 28, running = false, state, unread = 0, selected = false, title }: { avatar: Avatar; size?: number; running?: boolean; state?: AgentState; unread?: number; selected?: boolean; title?: string }) {
  const badge = unreadLabel(unread);
  return (
    <span title={title} aria-hidden className={cn("relative inline-flex shrink-0", selected && "drop-shadow-[0_0_6px_rgb(0_216_255/0.6)]")} style={{ width: size, height: size }}>
      <HexAvatar label={title ?? ""} active={selected} color={avatar.color} size={size}>
        <span style={{ fontSize: Math.round(size * 0.46) }}>{avatar.emoji}</span>
      </HexAvatar>
      {badge && <span className="agent-badge">{badge}</span>}
      {state === "needs_input" ? <span className="agent-running-dot agent-dot-needs-input" /> : state === "failed" ? <span className="agent-running-dot agent-dot-failed" /> : running && <span className="agent-running-dot" />}
    </span>
  );
}
