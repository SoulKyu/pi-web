"use client";
import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/useI18n";
import type { AgentListItem } from "@/lib/agents/agent-view";
import { formatRelativeTime } from "@/lib/i18n/format";
import { AgentAvatar } from "../AgentAvatar";
import { presenceOf } from "./presence";

/** Who you are talking to and what they are doing; every input is already loaded by AppShell. */
export function ConversationHeader({ agent, role, globalPaused, quietHours, details, onDetailsChange }: { agent: AgentListItem; role?: string; globalPaused: boolean; quietHours: boolean; details: boolean; onDetailsChange: (next: boolean) => void }) {
  const { t, locale } = useI18n();
  const switchId = useId();
  const presence = presenceOf({ state: agent.state, paused: agent.paused, globalPaused, quietHours });
  const status = presence.key === "available" && agent.lastActivityAt
    ? t("agents.presence.availableSince", { time: formatRelativeTime(agent.lastActivityAt, locale) })
    : t(`agents.presence.${presence.key}`);
  const roleLine = role?.split("\n").map((line) => line.trim()).find(Boolean);
  return (
    <header className="conv-header">
      <AgentAvatar avatar={agent.avatar} size={28} />
      <div className="conv-header-text">
        <div className="conv-header-line">
          <span className="conv-header-name">{agent.name}</span>
          <span className="conv-header-status" data-tone={presence.tone}>
            <span className="conv-header-dot" aria-hidden="true" />
            {status}
          </span>
        </div>
        {roleLine && <span className="conv-header-role" title={roleLine}>{roleLine}</span>}
      </div>
      <label htmlFor={switchId} className="conv-header-details" title={t("agents.chat.detailsHint")}>
        {t("agents.chat.details")}
        <Switch id={switchId} checked={details} onCheckedChange={onDetailsChange} />
      </label>
    </header>
  );
}
