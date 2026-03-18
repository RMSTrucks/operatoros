# Observatory

A pluggable metrics collection and alerting framework for OperatorOS. Monitors your systems, detects anomalies, and fires alerts when things go wrong.

## Architecture

```
collectors/           <- gather metrics from sources (system, git, services, etc.)
    |
    v
scanner.ts           <- orchestrator: runs collectors, stores results, evaluates alerts
    |
    v
server.ts            <- SQLite-backed store: metrics, snapshots, alert history
    |
    v
alert-rules.ts       <- threshold rules that fire when metrics cross boundaries
```

## Quick Start

```bash
# 1. Start the observatory server
bun observatory/server.ts

# 2. Run a scan (in another terminal)
bun observatory/scanner.ts

# 3. Check results
curl http://localhost:9201/          # health check
curl -X POST http://localhost:9201/call \
  -H "Content-Type: application/json" \
  -d '{"action":"latest"}'           # latest snapshots
```

## Adding a Collector

Create a file in `collectors/` that exports a `collect()` function:

```typescript
// collectors/my-service.ts
import { m } from "../common";
import type { CollectorResult } from "../types";

const SOURCE = "my_service";

export async function collect(): Promise<CollectorResult> {
  // Gather your metrics
  const responseTime = await pingMyService();

  return {
    source: SOURCE,
    metrics: [
      m(SOURCE, "response_ms", responseTime),
      m(SOURCE, "healthy", responseTime < 5000 ? 1 : 0),
    ],
    snapshot: {
      collected_at: new Date().toISOString(),
      response_ms: responseTime,
      summary: `Response time: ${responseTime}ms`,
    },
  };
}
```

The scanner auto-discovers collectors — just drop a `.ts` file in `collectors/` and it runs on the next scan. Files starting with `_` are ignored.

## Adding Alert Rules

Edit `alert-rules.ts` to add threshold-based alerts:

```typescript
{
  name: "my_service_slow",
  source: "my_service",        // matches collector source
  metric: "response_ms",       // matches metric name
  comparison: "gt",            // gt, lt, gte, lte, eq, neq
  threshold: 5000,
  cooldown_seconds: 600,       // 10 min between firings
  message: "My service response: {value}ms (threshold: {threshold}ms)",
  severity: "warning",         // critical, warning, info
}
```

## Adding Metric Expectations

Edit `expectations.ts` to define sane ranges. These catch broken collectors, not business problems:

```typescript
my_service: {
  response_ms: { min: 0, max: 60000, required: true },
  healthy: { min: 0, max: 1, required: true },
},
```

## Server API

All POST to `/call`:

| Action | Description |
|--------|-------------|
| `store_metrics` | Store metric array: `{"action":"store_metrics","metrics":[...]}` |
| `store_snapshot` | Store domain snapshot: `{"action":"store_snapshot","domain":"...","data":{...}}` |
| `latest` | Get latest snapshot per domain |
| `query` | Get metric history: `{"action":"query","source":"...","metric":"...","limit":100}` |
| `alerts` | Evaluate rules: `{"action":"alerts","sub_action":"evaluate"}` |
| `health` | Server health + counts |
| `cleanup` | Retention cleanup: `{"action":"cleanup","retention_days":90}` |

## Running on a Schedule

Use cron or a systemd timer to scan periodically:

```bash
# crontab -e
*/5 * * * * cd /path/to/observatory && bun scanner.ts >> /tmp/observatory-scan.log 2>&1
```

Or with a systemd timer:

```ini
# ~/.config/systemd/user/observatory-scan.timer
[Unit]
Description=Observatory scan every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# ~/.config/systemd/user/observatory-scan.service
[Unit]
Description=Observatory scan

[Service]
Type=oneshot
WorkingDirectory=/path/to/observatory
ExecStart=/usr/local/bin/bun scanner.ts
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9201` | Observatory server port |
| `OBSERVATORY_DATA_DIR` | `./data` | SQLite database directory |
| `OBSERVATORY_AUTH_TOKEN` | (none) | Bearer token for auth (optional) |
| `OBSERVATORY_URL` | `http://127.0.0.1:9201/call` | Server URL for scanner |

## Built-in Collectors

| Collector | Source | What it monitors |
|-----------|--------|-----------------|
| `system-health` | `system_health` | CPU, memory, disk, load average |
| `git-status` | `git_status` | Uncommitted changes across repos |
| `service-ping` | `service_ping` | HTTP service up/down + response time |

## Design Principles

- **No external dependencies** — runs on Bun + SQLite only
- **Auto-discovery** — drop a collector file, it runs next scan
- **Fail-safe** — one broken collector never blocks the scan
- **Self-monitoring** — the scanner tracks its own performance
- **Local-first** — all data stays on your machine
