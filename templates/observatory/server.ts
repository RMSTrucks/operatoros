#!/usr/bin/env bun
/**
 * Observatory Server — lightweight SQLite-backed metrics store + alert engine.
 *
 * Stores snapshots, metrics, and alert state. Evaluates alert rules on demand.
 * Runs as a standalone HTTP server on a configurable port.
 *
 * Usage:
 *   bun observatory/server.ts                    # default port 9201
 *   PORT=8080 bun observatory/server.ts          # custom port
 *
 * API (all POST to /call):
 *   {"action":"store_metrics","metrics":[...]}
 *   {"action":"store_snapshot","domain":"...","data":{...}}
 *   {"action":"latest"}
 *   {"action":"query","source":"...","metric":"..."}
 *   {"action":"alerts","sub_action":"evaluate"}
 *   {"action":"alerts","sub_action":"list_rules"}
 *   {"action":"health"}
 *   {"action":"cleanup","retention_days":90}
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { AlertRule, AlertComparison, TriggeredAlert } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "9201", 10);
const DATA_DIR = process.env.OBSERVATORY_DATA_DIR || resolve(process.cwd(), "data");
const DB_PATH = resolve(DATA_DIR, "observatory.db");
const AUTH_TOKEN = process.env.OBSERVATORY_AUTH_TOKEN || "";

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    dimensions TEXT,
    scan_id TEXT,
    collected_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_source_metric
    ON metrics(source, metric, collected_at);

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    data TEXT NOT NULL,
    scan_id TEXT,
    collected_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_domain
    ON snapshots(domain, collected_at);

  CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT NOT NULL,
    message TEXT NOT NULL,
    value REAL,
    threshold REAL,
    severity TEXT DEFAULT 'warning',
    delivered INTEGER DEFAULT 0,
    triggered_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_alert_history_rule
    ON alert_history(rule_name, triggered_at);
`);

// ---------------------------------------------------------------------------
// Alert rules — loaded from alert-rules.ts at startup
// ---------------------------------------------------------------------------

let ALERT_RULES: AlertRule[] = [];

async function loadAlertRules(): Promise<void> {
  const rulesPath = resolve(dirname(new URL(import.meta.url).pathname), "alert-rules.ts");
  if (existsSync(rulesPath)) {
    try {
      const mod = await import(rulesPath);
      ALERT_RULES = mod.ALERT_RULES || mod.default || [];
      console.log(`[observatory] Loaded ${ALERT_RULES.length} alert rules`);
    } catch (err) {
      console.warn(`[observatory] Failed to load alert rules: ${err}`);
    }
  } else {
    console.log("[observatory] No alert-rules.ts found — alerts disabled");
  }
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const insertMetric = db.prepare(
  "INSERT INTO metrics (source, metric, value, dimensions, scan_id) VALUES (?, ?, ?, ?, ?)",
);

const insertSnapshot = db.prepare(
  "INSERT INTO snapshots (domain, data, scan_id) VALUES (?, ?, ?)",
);

const insertAlert = db.prepare(
  "INSERT INTO alert_history (rule_name, message, value, threshold, severity) VALUES (?, ?, ?, ?, ?)",
);

const getLatestSnapshots = db.prepare(`
  SELECT domain, data, collected_at FROM snapshots
  WHERE id IN (SELECT MAX(id) FROM snapshots GROUP BY domain)
  ORDER BY domain
`);

const getMetricHistory = db.prepare(`
  SELECT value, collected_at FROM metrics
  WHERE source = ? AND metric = ?
  ORDER BY collected_at DESC
  LIMIT ?
`);

const getLatestMetricValue = db.prepare(`
  SELECT value FROM metrics
  WHERE source = ? AND metric = ?
  ORDER BY collected_at DESC
  LIMIT 1
`);

const getLastAlertTime = db.prepare(`
  SELECT triggered_at FROM alert_history
  WHERE rule_name = ?
  ORDER BY triggered_at DESC
  LIMIT 1
`);

// ---------------------------------------------------------------------------
// Alert evaluation
// ---------------------------------------------------------------------------

function compare(value: number, op: AlertComparison, threshold: number): boolean {
  switch (op) {
    case "gt": return value > threshold;
    case "lt": return value < threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
    case "eq": return value === threshold;
    case "neq": return value !== threshold;
    default: return false;
  }
}

function evaluateAlerts(): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];
  const now = Date.now();

  for (const rule of ALERT_RULES) {
    // Check cooldown
    const lastFired = getLastAlertTime.get(rule.name) as { triggered_at: string } | undefined;
    if (lastFired) {
      const lastTime = new Date(lastFired.triggered_at + "Z").getTime();
      if (now - lastTime < rule.cooldown_seconds * 1000) {
        continue; // still in cooldown
      }
    }

    // Get latest metric value
    const row = getLatestMetricValue.get(rule.source, rule.metric) as { value: number } | undefined;
    if (!row) continue; // no data yet

    if (compare(row.value, rule.comparison, rule.threshold)) {
      const message = rule.message
        .replace("{value}", String(row.value))
        .replace("{threshold}", String(rule.threshold));

      const alert: TriggeredAlert = {
        rule_name: rule.name,
        message,
        value: row.value,
        threshold: rule.threshold,
        triggered_at: new Date().toISOString(),
        severity: rule.severity || "warning",
      };

      // Record in history
      insertAlert.run(rule.name, message, row.value, rule.threshold, alert.severity);

      triggered.push(alert);
    }
  }

  return triggered;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

type ActionParams = Record<string, unknown>;

function handleAction(params: ActionParams): Record<string, unknown> {
  const action = params.action as string;

  switch (action) {
    case "store_metrics": {
      const metrics = params.metrics as Array<{
        source: string;
        metric: string;
        value: number;
        dimensions?: Record<string, unknown>;
      }>;
      const scanId = (params.scan_id as string) || null;

      const insertMany = db.transaction((items: typeof metrics) => {
        let inserted = 0;
        for (const m of items) {
          insertMetric.run(
            m.source,
            m.metric,
            m.value,
            m.dimensions ? JSON.stringify(m.dimensions) : null,
            scanId,
          );
          inserted++;
        }
        return inserted;
      });

      const inserted = insertMany(metrics);
      return { success: true, inserted };
    }

    case "store_snapshot": {
      const domain = params.domain as string;
      const data = params.data as Record<string, unknown>;
      const scanId = (params.scan_id as string) || null;
      insertSnapshot.run(domain, JSON.stringify(data), scanId);
      return { success: true };
    }

    case "latest": {
      const rows = getLatestSnapshots.all() as Array<{
        domain: string;
        data: string;
        collected_at: string;
      }>;
      const snapshots: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          snapshots[row.domain] = { data: JSON.parse(row.data), collected_at: row.collected_at };
        } catch {
          snapshots[row.domain] = { data: row.data, collected_at: row.collected_at };
        }
      }
      return { action: "latest", success: true, snapshots };
    }

    case "query": {
      const source = params.source as string;
      const metric = params.metric as string;
      const limit = (params.limit as number) || 100;
      const rows = getMetricHistory.all(source, metric, limit);
      return { success: true, source, metric, history: rows };
    }

    case "alerts": {
      const subAction = params.sub_action as string;
      if (subAction === "evaluate") {
        const triggered = evaluateAlerts();
        return { action: "alerts", success: true, triggered };
      }
      if (subAction === "list_rules") {
        return { action: "alerts", success: true, rules: ALERT_RULES };
      }
      return { error: "Unknown sub_action" };
    }

    case "health": {
      const metricCount = (
        db.prepare("SELECT COUNT(*) as c FROM metrics").get() as { c: number }
      ).c;
      const snapshotCount = (
        db.prepare("SELECT COUNT(*) as c FROM snapshots").get() as { c: number }
      ).c;
      const alertCount = (
        db.prepare("SELECT COUNT(*) as c FROM alert_history").get() as { c: number }
      ).c;
      return {
        success: true,
        status: "healthy",
        metrics_stored: metricCount,
        snapshots_stored: snapshotCount,
        alerts_recorded: alertCount,
        alert_rules_loaded: ALERT_RULES.length,
        uptime_seconds: Math.floor(process.uptime()),
      };
    }

    case "cleanup": {
      const days = (params.retention_days as number) || 90;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const deletedMetrics = db
        .prepare("DELETE FROM metrics WHERE collected_at < ?")
        .run(cutoff).changes;
      const deletedSnapshots = db
        .prepare("DELETE FROM snapshots WHERE collected_at < ?")
        .run(cutoff).changes;
      const deletedAlerts = db
        .prepare("DELETE FROM alert_history WHERE triggered_at < ?")
        .run(cutoff).changes;
      return {
        success: true,
        deleted: deletedMetrics + deletedSnapshots + deletedAlerts,
        details: {
          metrics: deletedMetrics,
          snapshots: deletedSnapshots,
          alerts: deletedAlerts,
        },
      };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await loadAlertRules();

  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // Health check on GET /
      if (req.method === "GET" && url.pathname === "/") {
        return Response.json(handleAction({ action: "health" }));
      }

      // All other requests: POST /call
      if (req.method !== "POST" || url.pathname !== "/call") {
        return Response.json({ error: "POST /call expected" }, { status: 405 });
      }

      // Auth check (optional — skip if no token configured)
      if (AUTH_TOKEN) {
        const auth = req.headers.get("Authorization");
        if (auth !== `Bearer ${AUTH_TOKEN}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
      }

      try {
        const body = (await req.json()) as ActionParams;
        // Support both direct params and nested {tool: "observatory", params: {...}}
        const params = body.params ? (body.params as ActionParams) : body;
        const result = handleAction(params);
        return Response.json(result);
      } catch (err) {
        return Response.json(
          { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 },
        );
      }
    },
  });

  console.log(`[observatory] Server running on http://localhost:${server.port}`);
  console.log(`[observatory] Data directory: ${DATA_DIR}`);
  console.log(`[observatory] Auth: ${AUTH_TOKEN ? "enabled" : "disabled (no OBSERVATORY_AUTH_TOKEN)"}`);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("[observatory] Shutting down...");
    db.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("[observatory] Shutting down...");
    db.close();
    process.exit(0);
  });
}

void main();
