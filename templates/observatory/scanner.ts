#!/usr/bin/env bun
/**
 * Observatory Scanner — runs all collectors, stores results, evaluates alerts.
 *
 * Usage:
 *   bun observatory/scanner.ts                   # full scan, stdout output
 *   bun observatory/scanner.ts --source X        # single collector
 *   bun observatory/scanner.ts --cleanup         # retention cleanup only
 *
 * Env:
 *   OBSERVATORY_URL  — observatory server URL (default: http://127.0.0.1:9201)
 *   OBSERVATORY_AUTH_TOKEN — bearer token for observatory server (optional)
 */

import { readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { safeCollect, validateExpectations } from "./common";
import type {
  CollectorFn,
  CollectorResult,
  CollectorRunResult,
  ExpectationMap,
  ScanSummary,
  TriggeredAlert,
} from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OBSERVATORY_URL = process.env.OBSERVATORY_URL || "http://127.0.0.1:9201/call";
const AUTH_TOKEN = process.env.OBSERVATORY_AUTH_TOKEN || "";
const CLEANUP_ONLY = process.argv.includes("--cleanup");

const SOURCES: string[] = (() => {
  const sources: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--source" && process.argv[i + 1]) {
      sources.push(process.argv[++i]);
    }
  }
  return sources;
})();

// ---------------------------------------------------------------------------
// Observatory client
// ---------------------------------------------------------------------------

async function callObservatory(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }

  const resp = await fetch(OBSERVATORY_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30_000),
  });

  return (await resp.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Collector discovery
// ---------------------------------------------------------------------------

/**
 * Auto-discover collectors from the collectors/ directory.
 * Each file must export a `collect()` function.
 */
async function discoverCollectors(): Promise<Record<string, CollectorFn>> {
  const collectorsDir = resolve(import.meta.dir, "collectors");
  const registry: Record<string, CollectorFn> = {};

  let files: string[];
  try {
    files = readdirSync(collectorsDir).filter(
      (f) => f.endsWith(".ts") && !f.startsWith("_"),
    );
  } catch {
    console.warn("[scanner] No collectors/ directory found");
    return registry;
  }

  for (const file of files) {
    const name = basename(file, ".ts");
    try {
      const mod = await import(resolve(collectorsDir, file));
      if (typeof mod.collect === "function") {
        registry[name] = mod.collect;
      } else {
        console.warn(`[scanner] ${file}: no collect() export, skipping`);
      }
    } catch (err) {
      console.error(`[scanner] Failed to load collector ${file}: ${err}`);
    }
  }

  return registry;
}

/**
 * Load metric expectations from expectations.ts if it exists.
 */
async function loadExpectations(): Promise<ExpectationMap> {
  const expectationsPath = resolve(import.meta.dir, "expectations.ts");
  try {
    const mod = await import(expectationsPath);
    return mod.METRIC_EXPECTATIONS || mod.default || {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

async function runScan(): Promise<ScanSummary> {
  const scanStart = Date.now();
  const scanId = `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  console.log(`[scanner] Starting scan ${scanId}`);

  // Discover collectors
  const collectors = await discoverCollectors();
  const collectorNames = SOURCES.length > 0 ? SOURCES : Object.keys(collectors);

  // Validate sources
  for (const src of SOURCES) {
    if (!collectors[src]) {
      console.error(
        `[scanner] Unknown source: ${src}. Available: ${Object.keys(collectors).join(", ")}`,
      );
      process.exit(1);
    }
  }

  console.log(`[scanner] Running ${collectorNames.length} collector(s): ${collectorNames.join(", ")}`);

  // Run all collectors in parallel
  const runResults = await Promise.allSettled(
    collectorNames.map(async (name): Promise<CollectorRunResult> => {
      const start = Date.now();
      const result = await safeCollect(name, collectors[name]);
      return {
        name,
        result,
        elapsed_ms: Date.now() - start,
        success: !result.error,
      };
    }),
  );

  // Process results
  let totalMetrics = 0;
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];
  const collectedResults: CollectorResult[] = [];

  for (const settled of runResults) {
    if (settled.status === "rejected") continue;

    const { name, result, elapsed_ms, success } = settled.value;

    if (success) {
      console.log(`[scanner] ${name}: OK (${result.metrics.length} metrics, ${elapsed_ms}ms)`);
      successCount++;
      collectedResults.push(result);
    } else {
      console.log(`[scanner] ${name}: ERROR -- ${result.error} (${elapsed_ms}ms)`);
      failCount++;
      errors.push(`${name}: ${result.error}`);
    }

    // Store metrics in observatory
    if (result.metrics.length > 0) {
      try {
        const storeResult = await callObservatory({
          action: "store_metrics",
          metrics: result.metrics,
          scan_id: scanId,
        });
        totalMetrics += (storeResult.inserted as number) || 0;
      } catch (err) {
        console.error(`[scanner] Failed to store metrics for ${name}: ${err}`);
      }
    }

    // Store snapshot
    try {
      await callObservatory({
        action: "store_snapshot",
        domain: result.source,
        data: result.snapshot,
        scan_id: scanId,
      });
    } catch (err) {
      console.error(`[scanner] Failed to store snapshot for ${name}: ${err}`);
    }
  }

  const elapsed = Date.now() - scanStart;
  console.log(
    `[scanner] Complete: ${successCount}/${collectorNames.length} OK, ${totalMetrics} metrics stored, ${(elapsed / 1000).toFixed(1)}s`,
  );

  // Validate metric expectations
  const expectations = await loadExpectations();
  if (Object.keys(expectations).length > 0) {
    const anomalies = validateExpectations(collectedResults, expectations);
    if (anomalies.length > 0) {
      console.log(`[scanner] Metric expectations: ${anomalies.length} anomaly warning(s):`);
      for (const w of anomalies) {
        if (w.issue === "missing") {
          console.warn(`[scanner]   ANOMALY: ${w.source}.${w.metric} -- MISSING`);
        } else if (w.issue === "below_min") {
          console.warn(`[scanner]   ANOMALY: ${w.source}.${w.metric} = ${w.value} (min: ${w.expected.min})`);
        } else {
          console.warn(`[scanner]   ANOMALY: ${w.source}.${w.metric} = ${w.value} (max: ${w.expected.max})`);
        }
      }
    } else {
      console.log("[scanner] Metric expectations: all values within sane ranges.");
    }
  }

  // Evaluate alert rules
  let alertsTriggered: TriggeredAlert[] = [];
  console.log("[scanner] Evaluating alert rules...");
  try {
    const alertResult = await callObservatory({
      action: "alerts",
      sub_action: "evaluate",
    });

    alertsTriggered = (alertResult.triggered as TriggeredAlert[]) || [];
    if (alertsTriggered.length > 0) {
      console.log(`[scanner] ${alertsTriggered.length} alert(s) triggered!`);
      for (const alert of alertsTriggered) {
        console.log(`[scanner]   ALERT [${alert.severity}]: ${alert.message}`);
      }
    } else {
      console.log("[scanner] No alerts triggered.");
    }
  } catch (err) {
    console.error(`[scanner] Alert evaluation failed: ${err}`);
  }

  // Self-monitoring metrics
  try {
    await callObservatory({
      action: "store_metrics",
      metrics: [
        { source: "observatory", metric: "scan_duration_ms", value: elapsed },
        { source: "observatory", metric: "collectors_ok", value: successCount },
        { source: "observatory", metric: "collectors_failed", value: failCount },
        { source: "observatory", metric: "metrics_stored", value: totalMetrics },
        { source: "observatory", metric: "alerts_triggered", value: alertsTriggered.length },
      ],
      scan_id: scanId,
    });
  } catch {}

  return {
    scan_id: scanId,
    started_at: new Date(scanStart).toISOString(),
    duration_ms: elapsed,
    collectors_ok: successCount,
    collectors_failed: failCount,
    total_metrics: totalMetrics,
    alerts_triggered: alertsTriggered,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (CLEANUP_ONLY) {
    console.log("[scanner] Cleanup-only mode");
    await callObservatory({ action: "cleanup", retention_days: 90 });
    return;
  }

  const summary = await runScan();

  // Print summary as JSON for automation
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

void main().catch((err) => {
  console.error(`[scanner] Fatal error: ${err}`);
  process.exit(1);
});
