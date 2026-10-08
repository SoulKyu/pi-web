# FinOps: runs.jsonl in Grafana

Files: `lib/agent-ops/run-registry.ts`, `lib/agent-ops/run-usage.ts`, `lib/agent-ops/scheduler.ts` (rotation).

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
