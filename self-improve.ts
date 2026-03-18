#!/usr/bin/env bun
/**
 * Self-Improvement Loop — the Karpathy autoresearch pattern for OperatorOS.
 *
 * Cycle: measure -> pick -> experiment -> log -> sleep -> repeat
 *
 * Usage:
 *   bun self-improve.ts                     # run the loop (20min cycles)
 *   bun self-improve.ts --once              # single cycle then exit
 *   bun self-improve.ts --interval 10       # 10 minute cycles
 *   bun self-improve.ts --dry-run           # show what would happen
 *   bun self-improve.ts --summary           # show loop history
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const HOME = process.env.HOME ?? "/home/jake-deaton";
const OPERATOROS_DIR = resolve(HOME, "operatoros");
const LOOP_LOG = join(OPERATOROS_DIR, "metrics", "loop-log.jsonl");
const METRICS_DIR = join(OPERATOROS_DIR, "metrics");

const ONCE = process.argv.includes("--once");
const DRY_RUN = process.argv.includes("--dry-run");
const SUMMARY = process.argv.includes("--summary");

const intervalArg = process.argv.find((_, i) => process.argv[i - 1] === "--interval");
const INTERVAL_MIN = parseInt(intervalArg ?? "20", 10);

// ---------------------------------------------------------------------------
// Summary mode
// ---------------------------------------------------------------------------

interface LoopEntry {
  timestamp: string;
  metric: string;
  before_value: number;
  after_value: number;
  before_score: number;
  after_score: number;
  improved: boolean;
  kept: boolean;
  duration_ms: number;
  error?: string;
}

function showSummary(): void {
  if (!existsSync(LOOP_LOG)) {
    console.log("No loop history yet. Run the loop first.");
    return;
  }

  const entries: LoopEntry[] = readFileSync(LOOP_LOG, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (entries.length === 0) {
    console.log("No experiments recorded yet.");
    return;
  }

  const total = entries.length;
  const improved = entries.filter((e) => e.improved).length;
  const kept = entries.filter((e) => e.kept).length;
  const reverted = entries.filter((e) => !e.kept && !e.error).length;
  const errored = entries.filter((e) => e.error && e.error !== "dry_run").length;

  console.log("Self-Improvement Loop Summary");
  console.log("=".repeat(40));
  console.log(`Total experiments:  ${total}`);
  console.log(`Improvements kept:  ${kept}`);
  console.log(`Improvements found: ${improved}`);
  console.log(`Reverted:           ${reverted}`);
  console.log(`Errors:             ${errored}`);
  console.log();

  // Per-metric breakdown
  const byMetric = new Map<string, { total: number; kept: number; improved: number }>();
  for (const e of entries) {
    const m = byMetric.get(e.metric) ?? { total: 0, kept: 0, improved: 0 };
    m.total++;
    if (e.kept) m.kept++;
    if (e.improved) m.improved++;
    byMetric.set(e.metric, m);
  }

  console.log("By metric:");
  for (const [metric, stats] of byMetric) {
    console.log(
      `  ${metric}: ${stats.total} experiments, ${stats.kept} kept, ${stats.improved} improved`,
    );
  }

  // Net score changes per metric
  console.log("\nNet score changes:");
  for (const [metric] of byMetric) {
    const metricEntries = entries.filter((e) => e.metric === metric && e.kept);
    if (metricEntries.length > 0) {
      const first = metricEntries[0];
      const last = metricEntries[metricEntries.length - 1];
      const delta = last.after_score - first.before_score;
      console.log(
        `  ${metric}: ${(delta * 100).toFixed(0)}% (${(first.before_score * 100).toFixed(0)}% -> ${(last.after_score * 100).toFixed(0)}%)`,
      );
    }
  }

  // Last 5 experiments
  console.log("\nRecent experiments:");
  for (const e of entries.slice(-5)) {
    const status = e.error
      ? `ERROR(${e.error})`
      : e.kept
        ? "KEPT"
        : e.improved
          ? "IMPROVED(merge failed)"
          : "REVERTED";
    console.log(
      `  ${e.timestamp.slice(0, 16)} ${e.metric} ${status} (${(e.before_score * 100).toFixed(0)}%->${(e.after_score * 100).toFixed(0)}%) ${e.duration_ms}ms`,
    );
  }
}

// ---------------------------------------------------------------------------
// Single cycle
// ---------------------------------------------------------------------------

function runBun(script: string, args: string[] = []): string {
  const result = spawnSync("bun", [script, ...args], {
    cwd: OPERATOROS_DIR,
    encoding: "utf-8",
    timeout: 180000, // 3 min max per step
    stdio: "pipe",
    env: {
      ...process.env,
      CLAUDECODE: undefined,
      CLAUDE_CODE_SESSION: undefined,
    },
  });

  if (result.error) throw result.error;
  return result.stdout;
}

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Cycle start: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(50)}`);

  // Step 1: Collect metrics
  console.log("\n[1/4] Collecting metrics...");
  try {
    const output = runBun("lib/collect-metrics.ts");
    console.log(output);
  } catch (e) {
    console.log(`  Collector error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Step 2: Pick improvement target
  console.log("\n[2/4] Picking improvement target...");
  try {
    const pickerArgs = DRY_RUN ? ["--dry-run"] : [];
    const output = runBun("lib/picker.ts", pickerArgs);
    console.log(output);

    // Check if picker found nothing to improve
    if (output.includes("all_at_baseline") || output.includes("Nothing to improve")) {
      console.log("\nAll metrics at baseline. Sleeping...");
      return;
    }
  } catch (e) {
    console.log(`  Picker error: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // Step 3: Run experiment
  console.log("\n[3/4] Running experiment...");
  try {
    const runnerArgs = DRY_RUN ? ["--dry-run"] : [];
    const output = runBun("lib/runner.ts", runnerArgs);
    console.log(output);
  } catch (e) {
    console.log(`  Runner error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Step 4: Log cycle completion
  const cycleDuration = Date.now() - cycleStart;
  console.log(`\n[4/4] Cycle complete in ${(cycleDuration / 1000).toFixed(1)}s`);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (SUMMARY) {
    showSummary();
    return;
  }

  // Ensure metrics dir exists
  if (!existsSync(METRICS_DIR)) mkdirSync(METRICS_DIR, { recursive: true });

  console.log("OperatorOS Self-Improvement Loop");
  console.log(`Mode: ${ONCE ? "single cycle" : `continuous (${INTERVAL_MIN}min interval)`}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Working directory: ${OPERATOROS_DIR}`);

  if (ONCE) {
    await runCycle();
    return;
  }

  // Continuous loop
  let cycleCount = 0;
  const shutdown = () => {
    console.log(`\nShutdown after ${cycleCount} cycles.`);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (true) {
    cycleCount++;
    console.log(`\n--- Cycle ${cycleCount} ---`);

    try {
      await runCycle();
    } catch (e) {
      console.error(`Cycle ${cycleCount} failed:`, e);
    }

    if (ONCE) break;

    console.log(`\nSleeping ${INTERVAL_MIN} minutes...`);
    await Bun.sleep(INTERVAL_MIN * 60 * 1000);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
