/**
 * Metric Expectations — sane-range validation for collector outputs.
 *
 * Catches gross anomalies caused by broken collectors or silent source changes.
 * Ranges are intentionally WIDE — detecting broken plumbing, not fluctuations.
 *
 * Add expectations for your custom collectors here.
 */

import type { ExpectationMap } from "./types";

export const METRIC_EXPECTATIONS: ExpectationMap = {
  system_health: {
    cpu_usage_pct: { min: 0, max: 100, required: true },
    memory_usage_pct: { min: 0, max: 100, required: true },
    disk_usage_pct: { min: 0, max: 100, required: true },
    load_avg_1m: { min: 0, max: 1000 },
  },

  git_status: {
    dirty_repos_count: { min: 0, max: 100 },
    max_stale_hours: { min: 0, max: 8760 }, // 1 year
  },

  service_ping: {
    services_up: { min: 0, max: 100 },
    services_down: { min: 0, max: 100 },
  },
};
