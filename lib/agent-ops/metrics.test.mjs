import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "pi-web-metrics-"));
const jiti = (await import("jiti")).createJiti(import.meta.url, { moduleCache: false });
const { recordRunMetrics, renderPrometheus, resetRunMetrics } = await jiti.import("./metrics.ts");
const { appendRunRecord } = await jiti.import("./run-registry.ts");
const usage = { input: 10, output: 5, cacheRead: 3, cacheWrite: 1, cost: 0.25, turns: 1, toolCalls: 0 };
const record = (over = {}) => ({ ts: "2026-10-07T01:00:00.000Z", agent: "sre", origin: "trigger", status: "completed", durationMs: 2500, usage, billing: "api", ...over });

test("counters accumulate per label set and render in exposition format", () => {
  resetRunMetrics();
  recordRunMetrics(record());
  recordRunMetrics(record({ status: "failed", durationMs: 500 }));
  const text = renderPrometheus();
  assert.match(text, /# TYPE pi_web_runs_total counter/);
  assert.match(text, /# TYPE pi_web_run_duration_seconds_sum counter/);
  assert.ok(text.includes('pi_web_runs_total{agent="sre",origin="trigger",status="completed"} 1\n'));
  assert.ok(text.includes('pi_web_runs_total{agent="sre",origin="trigger",status="failed"} 1\n'));
  assert.ok(text.includes('pi_web_run_tokens_total{agent="sre",kind="input"} 20\n'));
  assert.ok(text.includes('pi_web_run_tokens_total{agent="sre",kind="cache_write"} 2\n'));
  assert.ok(text.includes('pi_web_run_cost_usd_total{agent="sre"} 0.5\n'));
  assert.ok(text.includes('pi_web_run_duration_seconds_sum{agent="sre"} 3\n'));
  assert.ok(text.includes('pi_web_run_duration_seconds_count{agent="sre"} 2\n'));
  assert.ok(text.endsWith("\n"));
});

test("label values are escaped; missing or non-finite numbers never render NaN", () => {
  resetRunMetrics();
  recordRunMetrics(record({ agent: 'a"b\\c\nd', durationMs: undefined, usage: { ...usage, cost: Number.NaN, input: undefined } }));
  const text = renderPrometheus();
  assert.ok(text.includes('agent="a\\"b\\\\c\\nd"'));
  assert.doesNotMatch(text, /NaN|undefined|Infinity/);
  assert.ok(text.includes('pi_web_run_duration_seconds_count{agent="a\\"b\\\\c\\nd"} 0\n'));
});

test("a record without an agent counts under agent=\"\"; an empty registry renders only TYPE lines", () => {
  resetRunMetrics();
  assert.doesNotMatch(renderPrometheus(), /^pi_web_/m);
  recordRunMetrics(record({ agent: undefined }));
  assert.ok(renderPrometheus().includes('pi_web_runs_total{agent="",origin="trigger",status="completed"} 1\n'));
});

test("appendRunRecord feeds the counters; a failed write does not", () => {
  resetRunMetrics();
  const path = join(mkdtempSync(join(tmpdir(), "m-")), "runs.jsonl");
  appendRunRecord(record(), path);
  assert.ok(renderPrometheus().includes('pi_web_runs_total{agent="sre",origin="trigger",status="completed"} 1\n'));
});
