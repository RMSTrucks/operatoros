#!/usr/bin/env bun
/**
 * Metrics Collector — measures all 5 scorecard metrics and appends to JSONL.
 *
 * Metrics:
 *   1. hook-reliability — hook failure rate (24h)
 *   2. vault-freshness — age of session-handoff.md in hours
 *   3. session-start-time — how long session-start.sh takes (ms)
 *   4. handoff-quality — does session-handoff.md have content from last 24h?
 *   5. knowledge-capture — count of tool-lessons.md lines (proxy for entries)
 */

import { record } from "./scorecard.ts";
import { statSync, readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const VAULT_DIR = join(
  process.env.HOME ?? "/home/jake-deaton",
  ".claude/projects/-home-jake-deaton/memory",
);
const HANDOFF_PATH = join(VAULT_DIR, "ops/session-handoff.md");
const TOOL_LESSONS_PATH = join(VAULT_DIR, "ops/tool-lessons.md");
const HOOK_SCRIPT = join(
  process.env.HOME ?? "/home/jake-deaton",
  ".claude/hooks/session-start.sh",
);
const HOOK_SERVER = "http://127.0.0.1:9205";

const results: string[] = [];

// ---------------------------------------------------------------------------
// 1. Hook Reliability — failure rate from hook-server
// ---------------------------------------------------------------------------
async function collectHookReliability() {
  try {
    const res = await fetch(HOOK_SERVER);
    const data = (await res.json()) as {
      events_24h: number;
      events_total: number;
      status: string;
    };

    // Get failure count from observatory snapshot (already collected)
    // The hook server itself reports totals; failures_24h comes from observatory
    // We'll use the hook server status + check for error rate
    const events24h = data.events_24h ?? 0;

    // Query the hook DB directly for failure count
    let failures24h = 0;
    try {
      const dbPath = join(
        process.env.HOME ?? "/home/jake-deaton",
        ".openclaw/hook-server/activity.db",
      );
      const out = execSync(
        `bun -e "import Database from 'bun:sqlite'; const db = new Database('${dbPath}', {readonly:true}); const r = db.query(\\"SELECT COUNT(*) as c FROM tool_events WHERE json_extract(payload, '$.error') IS NOT NULL AND timestamp > datetime('now', '-24 hours')\\").get(); console.log(JSON.stringify(r)); db.close();"`,
        { encoding: "utf-8", timeout: 5000 },
      ).trim();
      const row = JSON.parse(out);
      failures24h = row.c ?? 0;
    } catch {
      // DB query failed, use 0
    }

    const reliabilityPct =
      events24h > 0 ? ((events24h - failures24h) / events24h) * 100 : 100;

    record("hook-reliability", reliabilityPct, {
      events_24h: events24h,
      failures_24h: failures24h,
    });
    results.push(
      `hook-reliability: ${reliabilityPct.toFixed(1)}% (${failures24h} failures / ${events24h} events)`,
    );
  } catch (e) {
    record("hook-reliability", 0, { error: String(e) });
    results.push(`hook-reliability: ERROR - ${e}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Vault Freshness — age of session-handoff.md
// ---------------------------------------------------------------------------
function collectVaultFreshness() {
  try {
    const stat = statSync(HANDOFF_PATH);
    const ageHours =
      (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
    record("vault-freshness", parseFloat(ageHours.toFixed(2)), {
      file: HANDOFF_PATH,
      mtime: stat.mtime.toISOString(),
    });
    results.push(`vault-freshness: ${ageHours.toFixed(1)}h since last update`);
  } catch (e) {
    record("vault-freshness", -1, { error: String(e) });
    results.push(`vault-freshness: ERROR - ${e}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Session Start Time — benchmark session-start.sh
// ---------------------------------------------------------------------------
function collectSessionStartTime() {
  try {
    if (!existsSync(HOOK_SCRIPT)) {
      record("session-start-time", -1, { error: "hook script not found" });
      results.push("session-start-time: hook script not found");
      return;
    }

    // Provide minimal stdin (hook protocol requires JSON input)
    const start = performance.now();
    execSync(`echo '{"cwd":"/tmp","session_id":"benchmark"}' | bash "${HOOK_SCRIPT}"`, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const elapsed = performance.now() - start;

    record("session-start-time", parseFloat(elapsed.toFixed(0)), {
      script: HOOK_SCRIPT,
    });
    results.push(`session-start-time: ${elapsed.toFixed(0)}ms`);
  } catch (e) {
    // Script may fail in benchmark mode — record the time anyway
    record("session-start-time", -1, { error: String(e).slice(0, 200) });
    results.push(`session-start-time: ERROR - hook script failed`);
  }
}

// ---------------------------------------------------------------------------
// 4. Handoff Quality — does handoff have recent content?
// ---------------------------------------------------------------------------
function collectHandoffQuality() {
  try {
    if (!existsSync(HANDOFF_PATH)) {
      record("handoff-quality", 0, { error: "file not found" });
      results.push("handoff-quality: file not found");
      return;
    }

    const content = readFileSync(HANDOFF_PATH, "utf-8");
    const stat = statSync(HANDOFF_PATH);
    const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

    // Check for date references in content (updated: YYYY-MM-DD)
    const dateMatch = content.match(/updated:\s*(\d{4}-\d{2}-\d{2})/);
    const hasRecentDate = dateMatch
      ? (Date.now() - new Date(dateMatch[1]).getTime()) / (1000 * 60 * 60) < 48
      : false;

    // Score: 1.0 = fresh (<6h, has date), 0.5 = stale but exists, 0.0 = missing/empty
    const lineCount = content.split("\n").filter((l) => l.trim()).length;
    let score = 0;
    if (lineCount > 5 && ageHours < 6 && hasRecentDate) score = 1.0;
    else if (lineCount > 5 && ageHours < 24) score = 0.75;
    else if (lineCount > 5) score = 0.5;
    else if (lineCount > 0) score = 0.25;

    record("handoff-quality", score, {
      age_hours: parseFloat(ageHours.toFixed(1)),
      line_count: lineCount,
      has_recent_date: hasRecentDate,
    });
    results.push(
      `handoff-quality: ${score} (${lineCount} lines, ${ageHours.toFixed(1)}h old, date=${hasRecentDate})`,
    );
  } catch (e) {
    record("handoff-quality", 0, { error: String(e) });
    results.push(`handoff-quality: ERROR - ${e}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Knowledge Capture — entries in tool-lessons.md
// ---------------------------------------------------------------------------
function collectKnowledgeCapture() {
  try {
    if (!existsSync(TOOL_LESSONS_PATH)) {
      record("knowledge-capture", 0, { error: "file not found" });
      results.push("knowledge-capture: file not found");
      return;
    }

    const content = readFileSync(TOOL_LESSONS_PATH, "utf-8");
    // Count non-empty, non-header lines as entries
    const lines = content.split("\n");
    const entryLines = lines.filter(
      (l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"),
    ).length;

    record("knowledge-capture", entryLines, {
      total_lines: lines.length,
      file: TOOL_LESSONS_PATH,
    });
    results.push(`knowledge-capture: ${entryLines} entries`);
  } catch (e) {
    record("knowledge-capture", 0, { error: String(e) });
    results.push(`knowledge-capture: ERROR - ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Collecting metrics...\n");

  await collectHookReliability();
  collectVaultFreshness();
  collectSessionStartTime();
  collectHandoffQuality();
  collectKnowledgeCapture();

  console.log("Results:");
  for (const r of results) {
    console.log(`  ${r}`);
  }
  console.log("\nDone. Metrics appended to ~/operatoros/metrics/*.jsonl");
}

main().catch(console.error);
