import { localeText } from "../web-push";
import { TERMINAL, type AgentTask } from "./task-store";

export interface Digest {
  runs: number;
  failed: Array<{ agent: string; title: string }>;
  byAgent: Record<string, { runs: number; failed: number; cards: number }>;
}

/** Terminal tasks completed at or after `since`. A card is what an isolated run that completed or failed posted to its agent's thread. */
export function buildDigest({ tasks, since }: { tasks: AgentTask[]; since: string; now: Date }): Digest {
  const digest: Digest = { runs: 0, failed: [], byAgent: {} };
  for (const task of tasks) {
    if (!TERMINAL.has(task.status) || !task.completedAt || task.completedAt < since) continue;
    const agent = task.agent ?? "?";
    const entry = (digest.byAgent[agent] ??= { runs: 0, failed: 0, cards: 0 });
    digest.runs++;
    entry.runs++;
    if (task.status === "failed") { digest.failed.push({ agent, title: task.title }); entry.failed++; }
    if (task.target === "isolated" && (task.status === "completed" || task.status === "failed")) entry.cards++;
  }
  return digest;
}

/** Deterministic text, never a model call. */
export function digestBody(digest: Digest, locale: string): string {
  return localeText(locale, "agentsDigest")
    .replace("{runs}", String(digest.runs))
    .replace("{failed}", String(digest.failed.length))
    .replace("{agents}", Object.keys(digest.byAgent).sort().join(", "));
}
