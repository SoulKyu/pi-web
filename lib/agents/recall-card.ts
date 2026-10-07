import type { CustomMessage } from "../types";

/** Written by pi-mem0 (src/recall-entry.ts): what the agent received from memory this run. Display-only, never in the model context. */
export const RECALL_ENTRY_TYPE = "pi-mem0:recall";
export const RECALL_UI_TYPE = "memory-recall";

export type RecallEntryData = {
  version: 1;
  query: string;
  ms: number;
  hits: Array<{ id: string; scope: "user" | "project" | "agent"; score: number; text: string }>;
};

const SCOPES = ["user", "project", "agent"];

export function isRecallEntryData(value: unknown): value is RecallEntryData {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && typeof data.query === "string" && typeof data.ms === "number" && Number.isFinite(data.ms) &&
    Array.isArray(data.hits) && data.hits.every((hit) => {
      if (typeof hit !== "object" || hit === null) return false;
      const h = hit as Record<string, unknown>;
      return typeof h.id === "string" && typeof h.scope === "string" && SCOPES.includes(h.scope) &&
        typeof h.score === "number" && Number.isFinite(h.score) && typeof h.text === "string";
    });
}

export function recallEntryToUiMessage(data: RecallEntryData, timestamp?: number): CustomMessage {
  return { role: "custom", customType: RECALL_UI_TYPE, content: "", display: true, details: data, ...(timestamp !== undefined ? { timestamp } : {}) };
}
