#!/usr/bin/env bun
/**
 * Morning Report Generator — daily intelligence briefing for OperatorOS.
 *
 * Reads from:
 *   - Observatory snapshots (what changed overnight)
 *   - Alert history (any alerts fired since last report)
 *   - Session handoffs (what was worked on yesterday)
 *
 * Outputs a structured markdown report to stdout, and optionally
 * delivers via the notification system.
 *
 * Usage:
 *   bun reports/morning-report.ts              # stdout only
 *   bun reports/morning-report.ts --notify     # stdout + notification delivery
 *   bun reports/morning-report.ts --json       # JSON output for automation
 *
 * Env:
 *   OBSERVATORY_URL         — observatory server URL (default: http://127.0.0.1:9201)
 *   OBSERVATORY_AUTH_TOKEN  — bearer token (optional)
 *   VAULT_DIR               — memory vault path (for session handoffs)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OBSERVATORY_URL = process.env.OBSERVATORY_URL || "http://127.0.0.1:9201/call";
const AUTH_TOKEN = process.env.OBSERVATORY_AUTH_TOKEN || "";
const SEND_NOTIFY = process.argv.includes("--notify");
const JSON_OUTPUT = process.argv.includes("--json");

// Auto-detect vault directory
const HOME = process.env.HOME || "/home/user";
const VAULT_DIR = process.env.VAULT_DIR || (() => {
  const homeKey = HOME.replace(/^\//, "").replace(/\//g, "-");
  return resolve(HOME, `.claude/projects/-${homeKey}/memory`);
})();

// ---------------------------------------------------------------------------
// Observatory client
// ---------------------------------------------------------------------------

async function callObservatory(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

  try {
    // Try direct params first (OperatorOS format), fall back to wrapped (Genesis format)
    const resp = await fetch(OBSERVATORY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await resp.json()) as Record<string, unknown>;

    // If we got an unknown tool error, retry with Genesis wrapper format
    if (result.error && String(result.error).includes("Unknown tool")) {
      const resp2 = await fetch(OBSERVATORY_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ tool: "observatory", params }),
        signal: AbortSignal.timeout(10_000),
      });
      return (await resp2.json()) as Record<string, unknown>;
    }

    return result;
  } catch (err) {
    return { error: `Observatory unreachable: ${err}` };
  }
}

// ---------------------------------------------------------------------------
// Report sections
// ---------------------------------------------------------------------------

interface ReportSection {
  title: string;
  content: string;
  empty: boolean;
}

async function getSystemOverview(): Promise<ReportSection> {
  const result = await callObservatory({ action: "latest" });
  if (result.error) {
    return { title: "System Overview", content: `Observatory unavailable: ${result.error}`, empty: false };
  }

  const snapshots = result.snapshots as Record<string, { data: Record<string, unknown>; collected_at: string }> || {};
  const lines: string[] = [];

  for (const [domain, info] of Object.entries(snapshots)) {
    const summary = (info.data as Record<string, unknown>)?.summary;
    if (summary) {
      lines.push(`- **${domain}**: ${summary}`);
    }
  }

  if (lines.length === 0) {
    return { title: "System Overview", content: "No observatory data available.", empty: true };
  }

  return { title: "System Overview", content: lines.join("\n"), empty: false };
}

async function getAlertSummary(): Promise<ReportSection> {
  const result = await callObservatory({
    action: "query",
    source: "observatory",
    metric: "alerts_triggered",
    limit: 24, // last 24 data points
  });

  if (result.error) {
    return { title: "Alerts (24h)", content: "Could not query alert history.", empty: true };
  }

  const history = result.history as Array<{ value: number; collected_at: string }> || [];
  const totalAlerts = history.reduce((sum, h) => sum + h.value, 0);

  if (totalAlerts === 0) {
    return { title: "Alerts (24h)", content: "No alerts fired in the last 24 hours.", empty: false };
  }

  return {
    title: "Alerts (24h)",
    content: `**${totalAlerts} alert(s)** fired in the last 24 hours.\n\nCheck observatory for details: \`curl -X POST ${OBSERVATORY_URL} -d '{"action":"alerts","sub_action":"evaluate"}'\``,
    empty: false,
  };
}

async function getHealthMetrics(): Promise<ReportSection> {
  // Query key health metrics
  const metrics = [
    { source: "system_health", metric: "cpu_usage_pct", label: "CPU" },
    { source: "system_health", metric: "memory_usage_pct", label: "Memory" },
    { source: "system_health", metric: "disk_usage_pct", label: "Disk" },
    { source: "system_health", metric: "load_avg_1m", label: "Load" },
  ];

  const lines: string[] = [];

  for (const { source, metric, label } of metrics) {
    const result = await callObservatory({
      action: "query",
      source,
      metric,
      limit: 1,
    });

    const history = (result.history as Array<{ value: number }>) || [];
    if (history.length > 0) {
      const value = history[0].value;
      const suffix = metric.includes("pct") ? "%" : "";
      lines.push(`- ${label}: ${value}${suffix}`);
    }
  }

  if (lines.length === 0) {
    return { title: "Health Metrics", content: "No health data available.", empty: true };
  }

  return { title: "Health Metrics", content: lines.join("\n"), empty: false };
}

function getSessionHandoff(): ReportSection {
  const handoffPath = resolve(VAULT_DIR, "ops/session-handoff.md");

  if (!existsSync(handoffPath)) {
    return { title: "Last Session", content: "No session handoff found.", empty: true };
  }

  try {
    const content = readFileSync(handoffPath, "utf-8");
    // Extract the key sections (skip frontmatter)
    const body = content.replace(/^---[\s\S]*?---\n*/m, "").trim();

    if (!body || body.length < 20) {
      return { title: "Last Session", content: "Session handoff is empty.", empty: true };
    }

    // Truncate if too long
    const truncated = body.length > 500 ? body.slice(0, 497) + "..." : body;
    return { title: "Last Session", content: truncated, empty: false };
  } catch {
    return { title: "Last Session", content: "Could not read session handoff.", empty: true };
  }
}

function getActiveThreads(): ReportSection {
  const threadsPath = resolve(VAULT_DIR, "ops/active-threads.md");

  if (!existsSync(threadsPath)) {
    return { title: "Active Threads", content: "No active threads file found.", empty: true };
  }

  try {
    const content = readFileSync(threadsPath, "utf-8");
    const body = content.replace(/^---[\s\S]*?---\n*/m, "").trim();

    if (!body || body.length < 20) {
      return { title: "Active Threads", content: "No active threads.", empty: true };
    }

    const truncated = body.length > 500 ? body.slice(0, 497) + "..." : body;
    return { title: "Active Threads", content: truncated, empty: false };
  } catch {
    return { title: "Active Threads", content: "Could not read active threads.", empty: true };
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

interface MorningReport {
  generated_at: string;
  sections: ReportSection[];
}

async function generateReport(): Promise<MorningReport> {
  const sections = await Promise.all([
    getSystemOverview(),
    getHealthMetrics(),
    getAlertSummary(),
    getSessionHandoff(),
    getActiveThreads(),
  ]);

  return {
    generated_at: new Date().toISOString(),
    sections,
  };
}

function formatMarkdown(report: MorningReport): string {
  const date = new Date(report.generated_at).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const lines = [`# Morning Report — ${date}`, ""];

  for (const section of report.sections) {
    lines.push(`## ${section.title}`, "", section.content, "");
  }

  lines.push("---", `Generated at ${new Date(report.generated_at).toLocaleTimeString()}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const report = await generateReport();

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const markdown = formatMarkdown(report);
  console.log(markdown);

  // Optional: send via notification system
  if (SEND_NOTIFY) {
    try {
      // Dynamic import of notification config
      const configPath = resolve(import.meta.dir, "../notifications/config.ts");
      if (existsSync(configPath)) {
        const { notifier } = await import(configPath);
        await notifier.info("morning_report", "reports", markdown.slice(0, 3500));
        console.error("[report] Notification sent.");
      } else {
        console.error("[report] No notification config found at:", configPath);
        console.error("[report] Copy config.example.ts to config.ts to enable notifications.");
      }
    } catch (err) {
      console.error(`[report] Notification failed: ${err}`);
    }
  }
}

void main().catch((err) => {
  console.error(`[report] Fatal error: ${err}`);
  process.exit(1);
});
