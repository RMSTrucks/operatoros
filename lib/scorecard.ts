/**
 * Scorecard — persistent JSONL metric storage.
 *
 * Each metric is a JSONL file: one JSON object per line, timestamped.
 * Dead simple. No database.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricEntry {
  ts: string; // ISO 8601
  value: number;
  meta?: Record<string, unknown>;
}

export interface MetricSummary {
  metric: string;
  latest: MetricEntry | null;
  count: number;
  min: number;
  max: number;
  avg: number;
  trend: "up" | "down" | "flat" | "unknown";
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DEFAULT_METRICS_DIR = join(import.meta.dir, "..", "metrics");

function metricsDir(dir?: string): string {
  const d = dir ?? DEFAULT_METRICS_DIR;
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function metricPath(metric: string, dir?: string): string {
  return join(metricsDir(dir), `${metric}.jsonl`);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function record(
  metric: string,
  value: number,
  meta?: Record<string, unknown>,
  dir?: string,
): MetricEntry {
  const entry: MetricEntry = {
    ts: new Date().toISOString(),
    value,
    ...(meta ? { meta } : {}),
  };
  appendFileSync(metricPath(metric, dir), JSON.stringify(entry) + "\n");
  return entry;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function readAll(metric: string, dir?: string): MetricEntry[] {
  const p = metricPath(metric, dir);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MetricEntry);
}

export function latest(metric: string, dir?: string): MetricEntry | null {
  const entries = readAll(metric, dir);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function tail(
  metric: string,
  n: number,
  dir?: string,
): MetricEntry[] {
  const entries = readAll(metric, dir);
  return entries.slice(-n);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function summarize(metric: string, dir?: string): MetricSummary {
  const entries = readAll(metric, dir);
  if (entries.length === 0) {
    return { metric, latest: null, count: 0, min: 0, max: 0, avg: 0, trend: "unknown" };
  }

  const values = entries.map((e) => e.value);
  const sum = values.reduce((a, b) => a + b, 0);

  // Trend: compare last 3 vs previous 3 averages
  let trend: MetricSummary["trend"] = "unknown";
  if (entries.length >= 6) {
    const recent = values.slice(-3);
    const prior = values.slice(-6, -3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / 3;
    const priorAvg = prior.reduce((a, b) => a + b, 0) / 3;
    const diff = recentAvg - priorAvg;
    const threshold = priorAvg * 0.05; // 5% threshold
    trend = Math.abs(diff) < threshold ? "flat" : diff > 0 ? "up" : "down";
  } else if (entries.length >= 2) {
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    trend = last > prev ? "up" : last < prev ? "down" : "flat";
  }

  return {
    metric,
    latest: entries[entries.length - 1],
    count: entries.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / entries.length,
    trend,
  };
}

export function summarizeAll(dir?: string): MetricSummary[] {
  const d = metricsDir(dir);
  const { readdirSync } = require("fs") as typeof import("fs");
  const files = readdirSync(d).filter((f: string) => f.endsWith(".jsonl"));

  return files.map((f: string) => {
    const name = f.replace(".jsonl", "");
    return summarize(name, dir);
  });
}
