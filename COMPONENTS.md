# OperatorOS Component Interfaces

Portable contracts for building against OperatorOS. Any system (Genesis, custom setups) can implement these interfaces to plug into the operator runtime.

## Component Types

| Type | Purpose | Discovery | Runtime |
|------|---------|-----------|---------|
| Collector | Gather metrics for observatory | Auto-discovered from `collectors/*.ts` | Parallel, fail-safe |
| Alert Rule | Fire when metrics cross thresholds | Loaded from `alert-rules.ts` | Evaluated per scan |
| Channel | Deliver notifications | Registered in notify config | Routed by severity |
| Hook | React to Claude Code lifecycle events | Declared in `settings.json` | Shell commands |
| Vault Template | Pre-built knowledge structure | Copied on `operatoros init` | Static markdown |

---

## Collector

Collectors gather data from any source and return it in a standard shape. The scanner auto-discovers any `*.ts` file in the `collectors/` directory (skipping files prefixed with `_`).

### Contract

```typescript
// Must be a named export
export async function collect(): Promise<CollectorResult>
```

### Types

```typescript
interface CollectorResult {
  source: string;                       // unique identifier, e.g. "system_health"
  metrics: Metric[];                    // numeric measurements
  snapshot: Record<string, unknown>;    // rich context (JSON-serializable)
  error?: string;                       // set on partial/full failure
}

interface Metric {
  source: string;                       // must match collector's source
  metric: string;                       // measurement name, e.g. "cpu_usage_pct"
  value: number;                        // the measured value
  dimensions?: Record<string, unknown>; // optional tags for grouping
  collected_at?: string;                // ISO timestamp (server adds if omitted)
}
```

### Helper

```typescript
import { m } from "../common";

// Shorthand metric builder
m("my_source", "metric_name", 42.5, { region: "us-east" })
```

### Rules

- Never throw. Return `{ source, metrics: [], snapshot: {}, error: "reason" }` on failure.
- One collector = one source. Don't mix sources in a single collector.
- Metrics must have numeric `value`. NaN is coerced to 0 with a warning.
- Collectors run in parallel via `Promise.allSettled()`. One failure never blocks others.

### Example

```typescript
import { m, safeCollect } from "../common";

const SOURCE = "my_service";

export async function collect() {
  return safeCollect(SOURCE, async () => {
    const resp = await fetch("http://localhost:8080/health");
    const data = await resp.json();

    return {
      source: SOURCE,
      metrics: [
        m(SOURCE, "response_time_ms", data.latency),
        m(SOURCE, "error_count", data.errors),
      ],
      snapshot: { status: data.status, version: data.version },
    };
  });
}
```

---

## Alert Rule

Alert rules evaluate the latest metric value against a threshold. Defined as an array export.

### Contract

```typescript
// alert-rules.ts
export const ALERT_RULES: AlertRule[]
```

### Types

```typescript
interface AlertRule {
  name: string;                    // unique rule identifier
  source: string;                  // collector source to monitor
  metric: string;                  // metric name to check
  comparison: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
  threshold: number;
  cooldown_seconds: number;        // minimum seconds between firings
  message: string;                 // template with {value} and {threshold}
  severity?: "critical" | "warning" | "info";
}

interface TriggeredAlert {
  rule_name: string;
  message: string;                 // expanded template
  value: number;
  threshold: number;
  triggered_at: string;
  severity: string;
}
```

### Rules

- `name` must be unique across all rules.
- `source` and `metric` must match what a collector emits.
- `message` supports `{value}` and `{threshold}` placeholders.
- Set `cooldown_seconds` high enough to prevent alert storms (3600 is a good default).

### Example

```typescript
export const ALERT_RULES: AlertRule[] = [
  {
    name: "high_cpu",
    source: "system_health",
    metric: "cpu_usage_pct",
    comparison: "gt",
    threshold: 90,
    cooldown_seconds: 3600,
    message: "CPU at {value}% (threshold: {threshold}%)",
    severity: "warning",
  },
];
```

---

## Notification Channel

Channels deliver notifications to a specific transport (Telegram, Slack, desktop, etc.).

### Contract

```typescript
export function createMyChannel(options?: MyOptions): NotificationChannel

interface NotificationChannel {
  name: string;                    // identifier, e.g. "telegram"
  send(notification: Notification): Promise<void>;
}
```

### Types

```typescript
type Severity = "critical" | "warning" | "info" | "noise";

interface Notification {
  type: string;                    // event classifier, e.g. "alert_fired"
  severity: Severity;
  source: string;                  // origin system
  message: string;                 // human-readable text
  fingerprint?: string;            // dedup key (auto-generated if omitted)
  metadata?: Record<string, unknown>;
}
```

### Rules

- **Never throw.** Log errors internally, return gracefully.
- Handle missing config silently (e.g., no env var = skip with console.warn).
- Truncate messages to channel limits before sending.
- Escape content for the transport (HTML for Telegram, markdown for Slack).

### Example

```typescript
import type { NotificationChannel, Notification } from "../types";

interface WebhookOptions {
  url?: string;
}

export function createWebhookChannel(options?: WebhookOptions): NotificationChannel {
  const url = options?.url ?? process.env.WEBHOOK_URL;

  return {
    name: "webhook",
    async send(notification: Notification): Promise<void> {
      if (!url) {
        console.warn("[webhook] No URL configured, skipping");
        return;
      }
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notification),
        });
      } catch (err) {
        console.error("[webhook] Send failed:", err);
      }
    },
  };
}
```

---

## Hook

Hooks are shell commands triggered by Claude Code lifecycle events. Configured in `settings.json`, not in OperatorOS code directly.

### Contract

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/hook.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Events

| Event | When | Common Use |
|-------|------|------------|
| `SessionStart` | Claude Code session begins | Load vault state, set context |
| `SessionEnd` | Session ends | Save handoff, capture learnings |
| `PreCompact` | Before context compaction | Preserve critical state |
| `PostToolUse` | After any tool execution | Capture tool outcomes, telemetry |

### Rules

- Hook scripts must be idempotent (safe to run multiple times).
- Keep timeouts short (10s default). Long hooks block the session.
- Exit 0 on success. Non-zero exits are logged as failures.
- Use `matcher` to filter: `"*"` for all, or a specific tool name like `"Bash"`.

### Example

```bash
#!/bin/bash
# session-start.sh — Load vault state into session context
set -euo pipefail

VAULT="$HOME/.claude/projects/-home-$(echo $USER | tr '/' '-')/memory"

if [ -f "$VAULT/ops/session-handoff.md" ]; then
  echo "Previous session context loaded"
  cat "$VAULT/ops/session-handoff.md"
fi
```

---

## Vault Template

Vault templates provide the initial knowledge structure for a new OperatorOS installation. They are static markdown files copied during `operatoros init`.

### Structure

```
vault/
  MEMORY.md              # Index — links to all memory files
  self/
    identity.md          # Who the AI is in this context
    capabilities.md      # What tools/access it has
    methodology.md       # How it processes and decides
    principal.md         # Who it works for
  ops/
    session-handoff.md   # Cross-session context (READ FIRST)
    active-threads.md    # Ongoing work items
    known-issues.md      # Gotchas and patterns
    tool-lessons.md      # Auto-captured tool failures
  notes/
    mocs/                # Maps of Content (navigation hubs)
```

### Rules

- Every vault has a `MEMORY.md` index at the root.
- Files use markdown with optional YAML frontmatter.
- `self/` describes the AI's identity and context. `ops/` tracks operational state. `notes/` holds accumulated knowledge.
- `session-handoff.md` is always read first on session start.
- Templates are starting points — users customize freely after init.

---

## Expectations (Validation)

Expectations define sane metric ranges to catch broken plumbing (wide bounds, not business thresholds).

### Contract

```typescript
export const METRIC_EXPECTATIONS: ExpectationMap

type ExpectationMap = Record<string, Record<string, MetricExpectation>>;

interface MetricExpectation {
  min?: number;      // value below this = anomaly warning
  max?: number;      // value above this = anomaly warning
  required?: boolean; // missing metric = anomaly warning
}
```

### Example

```typescript
export const METRIC_EXPECTATIONS: ExpectationMap = {
  system_health: {
    cpu_usage_pct: { min: 0, max: 100, required: true },
    memory_usage_pct: { min: 0, max: 100, required: true },
    disk_usage_pct: { min: 0, max: 100 },
  },
};
```

---

## Design Principles

These apply to all component types:

1. **Fail-safe** — One broken component never blocks the system. Wrap in error handlers, return gracefully.
2. **Auto-discovery** — Drop a file in the right directory, it's found. No registration boilerplate.
3. **Async-first** — All I/O is async. Collectors run in parallel.
4. **Type-safe** — Full TypeScript interfaces. Import from `types.ts`.
5. **Local-first** — SQLite storage, no external services required for core operation.
6. **Never throw** — Components log errors internally and return safe defaults.
