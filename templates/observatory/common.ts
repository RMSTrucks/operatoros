/**
 * Observatory Common — shared utilities for collectors and the scanner.
 *
 * Provides: metric builder, safe collector wrapper, expectation validation,
 * and basic helpers for parsing values.
 */

import type {
  Metric,
  CollectorResult,
  CollectorFn,
  ExpectationMap,
  MetricExpectation,
} from "./types";

// ---------------------------------------------------------------------------
// Metric builder
// ---------------------------------------------------------------------------

/** Shorthand to create a Metric. */
export function m(
  source: string,
  metric: string,
  value: number,
  dimensions?: Record<string, unknown>,
): Metric {
  return { source, metric, value, dimensions };
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

/** Parse "$123.45" to number. */
export function parseDollars(s: string | number | undefined): number {
  if (s === undefined || s === null) return 0;
  if (typeof s === "number") return s;
  return parseFloat(s.replace(/[$,]/g, "")) || 0;
}

/** Parse "12.5%" to number. */
export function parsePct(s: string | number | undefined): number {
  if (s === undefined || s === null) return 0;
  if (typeof s === "number") return s;
  return parseFloat(s.replace(/%/g, "")) || 0;
}

/** Safe number coercion — returns 0 for NaN/null/undefined. */
export function num(v: unknown): number {
  if (typeof v === "number" && !isNaN(v)) return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Collector output validation
// ---------------------------------------------------------------------------

/** Validate a collector result — coerces bad values, warns on low metric counts. */
export function validateResult(
  result: CollectorResult,
  expectedMinMetrics?: number,
): void {
  const { source, metrics } = result;

  if (expectedMinMetrics !== undefined && metrics.length < expectedMinMetrics) {
    console.warn(
      `[collector:${source}] WARNING: only ${metrics.length} metrics (expected >= ${expectedMinMetrics})`,
    );
  }

  for (const metric of metrics) {
    if (metric.value === null || metric.value === undefined || Number.isNaN(metric.value)) {
      console.warn(
        `[collector:${source}] WARNING: bad value for "${metric.metric}" — coercing to 0`,
      );
      metric.value = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Safe collector wrapper
// ---------------------------------------------------------------------------

/** Run a collector with error handling. Never throws. */
export async function safeCollect(
  source: string,
  fn: CollectorFn,
): Promise<CollectorResult> {
  try {
    const result = await fn();
    validateResult(result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[collector:${source}] ERROR: ${message}`);
    return {
      source,
      metrics: [m(source, "collector_error", 1)],
      snapshot: { error: message, collected_at: new Date().toISOString() },
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Metric expectation validation
// ---------------------------------------------------------------------------

export interface AnomalyWarning {
  source: string;
  metric: string;
  value: number;
  issue: "below_min" | "above_max" | "missing";
  expected: MetricExpectation;
}

/**
 * Validate collected metrics against sane-range expectations.
 * Returns warnings for anomalous values — does NOT block the scan.
 */
export function validateExpectations(
  results: CollectorResult[],
  expectations: ExpectationMap,
): AnomalyWarning[] {
  const warnings: AnomalyWarning[] = [];

  for (const result of results) {
    if (result.error) continue;

    const sourceExpectations = expectations[result.source];
    if (!sourceExpectations) continue;

    const actual = new Map<string, number>();
    for (const metric of result.metrics) {
      if (!metric.dimensions || Object.keys(metric.dimensions).length === 0) {
        actual.set(metric.metric, metric.value);
      }
    }

    for (const [metricName, expectation] of Object.entries(sourceExpectations)) {
      const value = actual.get(metricName);

      if (value === undefined) {
        if (expectation.required) {
          warnings.push({
            source: result.source,
            metric: metricName,
            value: NaN,
            issue: "missing",
            expected: expectation,
          });
        }
        continue;
      }

      if (expectation.min !== undefined && value < expectation.min) {
        warnings.push({
          source: result.source,
          metric: metricName,
          value,
          issue: "below_min",
          expected: expectation,
        });
      }

      if (expectation.max !== undefined && value > expectation.max) {
        warnings.push({
          source: result.source,
          metric: metricName,
          value,
          issue: "above_max",
          expected: expectation,
        });
      }
    }
  }

  return warnings;
}
