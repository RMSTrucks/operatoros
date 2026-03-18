/**
 * Alert Rules — define when the observatory should fire alerts.
 *
 * Each rule monitors a specific metric and fires when the value
 * crosses a threshold. Cooldowns prevent alert storms.
 *
 * Customize this file for your environment. The example rules below
 * work with the built-in example collectors.
 */

import type { AlertRule } from "./types";

export const ALERT_RULES: AlertRule[] = [
  // -------------------------------------------------------------------------
  // System health alerts (works with system-health collector)
  // -------------------------------------------------------------------------
  {
    name: "high_cpu",
    source: "system_health",
    metric: "cpu_usage_pct",
    comparison: "gt",
    threshold: 90,
    cooldown_seconds: 600, // 10 minutes
    message: "CPU usage is at {value}% (threshold: {threshold}%)",
    severity: "warning",
  },
  {
    name: "high_memory",
    source: "system_health",
    metric: "memory_usage_pct",
    comparison: "gt",
    threshold: 90,
    cooldown_seconds: 600,
    message: "Memory usage is at {value}% (threshold: {threshold}%)",
    severity: "warning",
  },
  {
    name: "disk_almost_full",
    source: "system_health",
    metric: "disk_usage_pct",
    comparison: "gt",
    threshold: 85,
    cooldown_seconds: 3600, // 1 hour
    message: "Disk usage is at {value}% (threshold: {threshold}%)",
    severity: "critical",
  },
  {
    name: "high_load",
    source: "system_health",
    metric: "load_avg_1m",
    comparison: "gt",
    threshold: 8,
    cooldown_seconds: 300,
    message: "Load average is {value} (threshold: {threshold})",
    severity: "warning",
  },

  // -------------------------------------------------------------------------
  // Git hygiene alerts (works with git-status collector)
  // -------------------------------------------------------------------------
  {
    name: "stale_uncommitted",
    source: "git_status",
    metric: "max_stale_hours",
    comparison: "gt",
    threshold: 48,
    cooldown_seconds: 14400, // 4 hours
    message: "Uncommitted changes sitting for {value} hours (threshold: {threshold}h)",
    severity: "info",
  },

  // -------------------------------------------------------------------------
  // Service health alerts (works with service-ping collector)
  // -------------------------------------------------------------------------
  {
    name: "service_down",
    source: "service_ping",
    metric: "services_down",
    comparison: "gt",
    threshold: 0,
    cooldown_seconds: 300, // 5 minutes
    message: "{value} service(s) are down",
    severity: "critical",
  },
  {
    name: "slow_response",
    source: "service_ping",
    metric: "max_response_ms",
    comparison: "gt",
    threshold: 5000,
    cooldown_seconds: 600,
    message: "Slowest service response: {value}ms (threshold: {threshold}ms)",
    severity: "warning",
  },
];
