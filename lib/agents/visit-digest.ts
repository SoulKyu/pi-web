import type { AgentMessage } from "../types";
import { AGENT_EVENT_UI_TYPE, AGENT_NOTIFY_TOOL, isAgentEventData } from "./events";
import { RECALL_UI_TYPE } from "./recall-card";

export interface VisitDigest { replies: number; schedules: number; tasks: number; webhooks: number; webhookFailed: number; notifies: number; recalls: number }

/** Counts the loaded messages after the read marker (all of them when the marker is not loaded). Pure counting, no model involved. */
export function digestSince(messages: readonly AgentMessage[], entryIds: readonly string[], marker: string | null): VisitDigest {
  const digest: VisitDigest = { replies: 0, schedules: 0, tasks: 0, webhooks: 0, webhookFailed: 0, notifies: 0, recalls: 0 };
  const at = marker ? entryIds.indexOf(marker) : -1;
  for (const message of messages.slice(at + 1)) {
    if (message.role === "assistant") {
      if (message.content.some((block) => block.type === "text" && block.text.trim())) digest.replies++;
      digest.notifies += message.content.filter((block) => block.type === "toolCall" && block.toolName === AGENT_NOTIFY_TOOL).length;
    } else if (message.role === "custom" && message.customType === RECALL_UI_TYPE) {
      digest.recalls++;
    } else if (message.role === "custom" && message.customType === AGENT_EVENT_UI_TYPE && isAgentEventData(message.details)) {
      const data = message.details;
      if (data.kind === "schedule") digest.schedules++;
      else if (data.kind === "task") digest.tasks++;
      else if (data.kind === "webhook") {
        digest.webhooks++;
        if (data.status === "failed") digest.webhookFailed++;
      }
    }
  }
  return digest;
}

/** "3 runs (1 failed) · 1 alert · 2 replies"; "" when everything is 0. */
export function digestLine(d: VisitDigest, t: (key: string, params?: Record<string, string | number>) => string): string {
  const runs = d.schedules + d.tasks + d.webhooks;
  const parts = [
    runs > 0 && (d.webhookFailed > 0 ? t("agents.digest.runsFailed", { count: runs, failed: d.webhookFailed }) : t("agents.digest.runs", { count: runs })),
    d.webhooks > 0 && t("agents.digest.alerts", { count: d.webhooks }),
    d.replies > 0 && t("agents.digest.replies", { count: d.replies }),
    d.notifies > 0 && t("agents.digest.notifies", { count: d.notifies }),
    d.recalls > 0 && t("agents.digest.recalls", { count: d.recalls }),
  ];
  return parts.filter(Boolean).join(" · ");
}
