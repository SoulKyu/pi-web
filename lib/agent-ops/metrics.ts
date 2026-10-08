import type { RunRecord } from "./run-registry";

interface Counters {
  runs: Map<string, number>;
  tokens: Map<string, number>;
  cost: Map<string, number>;
  durationSum: Map<string, number>;
  durationCount: Map<string, number>;
}

declare global {
  var __agentOpsMetrics: Counters | undefined;
}

const newCounters = (): Counters => ({ runs: new Map(), tokens: new Map(), cost: new Map(), durationSum: new Map(), durationCount: new Map() });
// On globalThis: the route and the runner may be bundled as separate module instances.
const counters = (): Counters => (globalThis.__agentOpsMetrics ??= newCounters());

const finite = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
// A label set is stored as its own JSON array so any character in a value stays unambiguous.
const add = (map: Map<string, number>, labels: string[], by: number): void => {
  const key = JSON.stringify(labels);
  map.set(key, (map.get(key) ?? 0) + by);
};

/** Fed by appendRunRecord only; in memory, back to zero on a process restart. */
export function recordRunMetrics(record: RunRecord): void {
  const c = counters();
  const agent = record.agent ?? "";
  add(c.runs, [agent, record.origin, record.status], 1);
  const { usage } = record;
  for (const [kind, n] of [["input", usage?.input], ["output", usage?.output], ["cache_read", usage?.cacheRead], ["cache_write", usage?.cacheWrite]] as const) {
    add(c.tokens, [agent, kind], finite(n));
  }
  add(c.cost, [agent], finite(usage?.cost));
  add(c.durationSum, [agent], finite(record.durationMs) / 1000);
  add(c.durationCount, [agent], finite(record.durationMs) > 0 ? 1 : 0);
}

export function resetRunMetrics(): void {
  globalThis.__agentOpsMetrics = newCounters();
}

const escapeLabel = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

function family(name: string, help: string, map: Map<string, number>, labelNames: string[]): string[] {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
  for (const [key, value] of map) {
    const values = JSON.parse(key) as string[];
    lines.push(`${name}{${labelNames.map((label, i) => `${label}="${escapeLabel(values[i])}"`).join(",")}} ${value}`);
  }
  return lines;
}

/** Prometheus text exposition format 0.0.4. */
export function renderPrometheus(): string {
  const c = counters();
  return `${[
    ...family("pi_web_runs_total", "Finished agent runs.", c.runs, ["agent", "origin", "status"]),
    ...family("pi_web_run_tokens_total", "Tokens used by finished runs.", c.tokens, ["agent", "kind"]),
    ...family("pi_web_run_cost_usd_total", "Provider-reported cost of finished runs in USD.", c.cost, ["agent"]),
    ...family("pi_web_run_duration_seconds_sum", "Summed duration of finished runs.", c.durationSum, ["agent"]),
    ...family("pi_web_run_duration_seconds_count", "Finished runs with a duration sample (average = sum / count).", c.durationCount, ["agent"]),
  ].join("\n")}\n`;
}
