/**
 * Observatory Types — core type definitions for the observatory framework.
 *
 * These types define the contract between collectors, the scanner,
 * the alert engine, and the storage server.
 */

// ---------------------------------------------------------------------------
// Metrics & Collectors
// ---------------------------------------------------------------------------

/** A single numeric measurement. */
export interface Metric {
  source: string;
  metric: string;
  value: number;
  dimensions?: Record<string, unknown>;
  collected_at?: string;
}

/** What every collector must return. */
export interface CollectorResult {
  source: string;
  metrics: Metric[];
  snapshot: Record<string, unknown>;
  error?: string;
}

/** A collector is an async function that gathers metrics from one source. */
export type CollectorFn = () => Promise<CollectorResult>;

// ---------------------------------------------------------------------------
// Metric Expectations (sanity checks)
// ---------------------------------------------------------------------------

/** Sane-range bounds for a single metric. */
export interface MetricExpectation {
  min?: number;
  max?: number;
  required?: boolean;
}

/** Map of source -> metric_name -> expectation. */
export type ExpectationMap = Record<string, Record<string, MetricExpectation>>;

// ---------------------------------------------------------------------------
// Alert Rules
// ---------------------------------------------------------------------------

export type AlertComparison = "gt" | "lt" | "gte" | "lte" | "eq" | "neq";

/** A rule that fires when a metric crosses a threshold. */
export interface AlertRule {
  name: string;
  source: string;
  metric: string;
  comparison: AlertComparison;
  threshold: number;
  /** Minimum seconds between firings of the same rule. */
  cooldown_seconds: number;
  /** Human-readable message template. Use {value} and {threshold} placeholders. */
  message: string;
  /** Severity level for routing/filtering. */
  severity?: "critical" | "warning" | "info";
}

/** A triggered alert instance. */
export interface TriggeredAlert {
  rule_name: string;
  message: string;
  value: number;
  threshold: number;
  triggered_at: string;
  severity: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** A notification to deliver to the user. */
export interface Notification {
  type: string;
  severity: string;
  source: string;
  message: string;
  fingerprint?: string;
}

/** A notification channel adapter. */
export interface NotificationChannel {
  name: string;
  send(notification: Notification): Promise<void>;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/** Result of running one collector during a scan. */
export interface CollectorRunResult {
  name: string;
  result: CollectorResult;
  elapsed_ms: number;
  success: boolean;
}

/** Summary of a full scan run. */
export interface ScanSummary {
  scan_id: string;
  started_at: string;
  duration_ms: number;
  collectors_ok: number;
  collectors_failed: number;
  total_metrics: number;
  alerts_triggered: TriggeredAlert[];
  errors: string[];
}
