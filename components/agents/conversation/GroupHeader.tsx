"use client";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { AgentAvatar } from "../AgentAvatar";

export const formatClock = (timestamp: number, locale: string): string =>
  new Date(timestamp).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

/** Avatar, name and time opening a run of messages by the same author. */
export function GroupHeader({ author, agent, timestamp }: { author: "agent" | "user"; agent?: { name: string; avatar: AgentListItem["avatar"] }; timestamp?: number }) {
  const { t, locale } = useI18n();
  return (
    <div className="conv-group-header" data-author={author}>
      <span className="conv-gutter" aria-hidden="true">
        {author === "agent" && agent ? <AgentAvatar avatar={agent.avatar} size={28} /> : <span className="conv-user-avatar">{t("agents.chat.youInitial")}</span>}
      </span>
      <span className="conv-name">{author === "agent" ? agent?.name : t("agents.chat.you")}</span>
      {timestamp !== undefined && <time className="conv-time" dateTime={new Date(timestamp).toISOString()}>{formatClock(timestamp, locale)}</time>}
    </div>
  );
}
