# FinOps: runs.jsonl in Grafana

Files: `lib/agent-ops/run-registry.ts`, `lib/agent-ops/run-usage.ts`, `lib/agent-ops/metrics.ts`, `app/api/metrics/route.ts`, `lib/agent-ops/scheduler.ts` (rotation).

## What `runs.jsonl` contains

`~/.pi/agent/agent-ops/runs.jsonl` (dir 0700, file 0600): one JSON line per finished run (task through the runner, user turn of a trusted thread). It outlives task retention (14 days) and thread resets.

```json
{"ts":"2026-10-07T01:00:00.000Z","agent":"sre","origin":"trigger","status":"completed","durationMs":41200,"triggerId":"…","taskId":"…","sessionId":"…","billing":"api","usage":{"input":1200,"output":340,"cacheRead":9000,"cacheWrite":0,"cost":0.0123,"turns":3,"toolCalls":2,"externalTools":false,"model":"…","provider":"…"}}
```

- `origin`: `ui` | `trigger` | `user` | `agent`; `status`: `completed` | `failed` | `cancelled`.
- `usage.cost` is the provider-reported cost; `costEquivalent` (subscription billing only) is kept apart, never summed into it.
- Tokens are not pre-summed: there is no `total_tokens`; add `usage.input + usage.output (+ cacheRead + cacheWrite)` in the query.
- Timestamps are UTC ISO strings. Daily budgets (`budget.ts`) use the server's local midnight; Grafana `[24h]` windows are rolling, so the two never match exactly.

## Promtail

```yaml
scrape_configs:
  - job_name: pi-web-runs
    static_configs:
      - targets: [localhost]
        labels:
          job: pi-web-runs
          __path__: /home/<user>/.pi/agent/agent-ops/runs.jsonl
    pipeline_stages:
      - json:
          expressions:
            ts: ts
            agent: agent
            origin: origin
            status: status
            input: usage.input
            output: usage.output
            cost: usage.cost
      - timestamp:
          source: ts
          format: RFC3339Nano
      - labels:
          agent:
          origin:
          status:
```

Point `__path__` at `runs.jsonl` exactly, not `runs*.jsonl`: rotated files (`runs.<timestamp>.jsonl`) would be read again.

## Grafana Alloy

```alloy
local.file_match "pi_web_runs" {
  path_targets = [{ __path__ = "/home/<user>/.pi/agent/agent-ops/runs.jsonl", job = "pi-web-runs" }]
}

loki.source.file "pi_web_runs" {
  targets    = local.file_match.pi_web_runs.targets
  forward_to = [loki.process.pi_web_runs.receiver]
}

loki.process "pi_web_runs" {
  stage.json {
    expressions = { ts = "ts", agent = "agent", origin = "origin", status = "status" }
  }
  stage.timestamp {
    source = "ts"
    format = "RFC3339Nano"
  }
  // Low-cardinality fields only. Tokens and cost stay in the line, parsed at query time.
  stage.labels {
    values = { agent = "", origin = "", status = "" }
  }
  forward_to = [loki.write.default.receiver]
}
```

Never label `taskId`, `sessionId` or token counts: each value would create a stream.

## Alert rules (LogQL)

Failed runs, more than 2 in an hour per agent:

```logql
sum by (agent) (count_over_time({job="pi-web-runs"} | json | status="failed" [1h])) > 2
```

Daily tokens per agent above a budget (replace `<budget>`; input + output):

```logql
sum by (agent) (sum_over_time({job="pi-web-runs"} | json | unwrap usage_input [24h]))
+ sum by (agent) (sum_over_time({job="pi-web-runs"} | json | unwrap usage_output [24h]))
> <budget>
```

`| json` flattens `usage.input` to `usage_input`. Add `cacheRead` / `cacheWrite` the same way (`usage_cacheRead`) if the budget counts them (the in-app daily budget does). For dollars, `unwrap usage_cost`.

## Troubleshooting

- **Nothing arrives**: the file exists only after the first finished run; check `ls -l ~/.pi/agent/agent-ops/runs.jsonl` and that the agent user running promtail/Alloy can read a 0600 file (same user, or adjust the unit).
- **Growth and rotation**: the scheduler renames the file to `runs.<timestamp>.jsonl` once it exceeds 10 MiB (checked hourly). Rotated files are never deleted; prune them yourself. Promtail and Alloy follow the rename by inode and finish the old file; the new `runs.jsonl` is picked up on the next poll.
- **Timezone**: line timestamps are UTC; the `timestamp` stage keeps Loki in UTC. Compare with the in-app budget (local midnight) knowing it differs.
- **Single writer**: the file is appended by one pi-web process. Two servers sharing one agent dir interleave lines (appends under 4 KiB stay whole on POSIX); run one ingestion agent per file.
- **Torn or junk line**: the app skips them; Loki ingests them as plain text and `| json` marks them `__error__`. Add `| __error__=""` if that shows up.

## Prometheus metrics (optional, off by default)

For a setup without Loki. `GET /api/metrics` renders in-memory counters in the text exposition format 0.0.4. They are fed by `appendRunRecord` (`recordRunMetrics()` in `lib/agent-ops/metrics.ts`) as each run finishes: no session scan, no re-read of `runs.jsonl`.

| Metric | Labels |
|---|---|
| `pi_web_runs_total` | `agent`, `origin`, `status` |
| `pi_web_run_tokens_total` | `agent`, `kind` = `input` \| `output` \| `cache_read` \| `cache_write` |
| `pi_web_run_cost_usd_total` | `agent` (provider `usage.cost` only, never `costEquivalent`) |
| `pi_web_run_duration_seconds_sum` / `_count` | `agent` (`_count` only counts runs that recorded a duration) |

- **Enable**: set `PI_WEB_METRICS_TOKEN` in the server's environment and restart. Unset or empty → `GET /api/metrics` answers 404.
- **Auth**: `Authorization: Bearer <token>` (constant-time compare); 401 otherwise. `proxy.ts` exempts exactly `GET /api/metrics` from the web password/session (the host check still applies), so the bearer is the only gate: use a long random token of at least 32 random bytes (`openssl rand -hex 32`) and keep the port off the public internet.
- **Counters restart at zero** with the process. Use `rate()` / `increase()`, which handle resets; they do not backfill past runs (use `runs.jsonl` for that). Only runs finished since the start are counted.
- Nothing from sessions, prompts or the token appears in the output; the `agent` label is the agent name.

```yaml
scrape_configs:
  - job_name: pi-web
    metrics_path: /api/metrics
    authorization: { type: Bearer, credentials_file: /etc/prometheus/pi-web.token }
    static_configs: [{ targets: ["127.0.0.1:30141"] }]
```

```promql
sum by (agent) (increase(pi_web_run_tokens_total[24h]))
sum by (agent) (increase(pi_web_runs_total{status="failed"}[1h])) > 2
```

Troubleshooting: 404 → token unset in the server process (not your shell); 401 → token mismatch or a proxy stripping `Authorization`; 403 → `Host` header not accepted by the host check (see files-and-access.md).
