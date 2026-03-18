#!/usr/bin/env bun
/**
 * Improvement Picker — reads scorecard metrics, picks the worst one,
 * generates an improvement proposal.
 *
 * Usage:
 *   bun lib/picker.ts              # pick one target, write proposal
 *   bun lib/picker.ts --dry-run    # show what would be picked, don't write
 *   bun lib/picker.ts --all        # show all metrics ranked
 */

import { summarizeAll, type MetricSummary } from "./scorecard.ts";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Metric definitions — baselines and "good" direction
// ---------------------------------------------------------------------------

interface MetricDef {
  name: string;
  baseline: number; // expected good value
  direction: "higher_is_better" | "lower_is_better";
  unit: string;
  improvementHints: string[]; // things to try when this metric is bad
}

const METRIC_DEFS: MetricDef[] = [
  {
    name: "hook-reliability",
    baseline: 100,
    direction: "higher_is_better",
    unit: "%",
    improvementHints: [
      "Check hook-server logs for errors: journalctl --user -u genesis-hook-server --since '24h ago'",
      "Verify hook scripts have correct permissions and exit cleanly",
      "Add error handling to hook scripts that are failing silently",
    ],
  },
  {
    name: "vault-freshness",
    baseline: 1, // <1h is good
    direction: "lower_is_better",
    unit: "hours",
    improvementHints: [
      "Check if session-stop hook is writing session-handoff.md",
      "Verify PreCompact hook fires and updates vault state",
      "Add a cron job to touch vault files if no session active for >6h",
    ],
  },
  {
    name: "session-start-time",
    baseline: 500, // <500ms is good
    direction: "lower_is_better",
    unit: "ms",
    improvementHints: [
      "Profile session-start.sh to find slow commands",
      "Parallelize independent API calls in session-start.sh",
      "Cache results that don't change between sessions",
      "Move slow operations to background (don't block session start)",
    ],
  },
  {
    name: "handoff-quality",
    baseline: 1.0, // 1.0 is perfect
    direction: "higher_is_better",
    unit: "score",
    improvementHints: [
      "Check session-stop hook writes a meaningful handoff",
      "Ensure handoff includes date stamp (updated: YYYY-MM-DD)",
      "Add more context to handoff: active threads, blockers, next steps",
      "Verify PreCompact hook captures context before compression",
    ],
  },
  {
    name: "knowledge-capture",
    baseline: 20, // 20+ entries is good
    direction: "higher_is_better",
    unit: "entries",
    improvementHints: [
      "Review tool-lessons.md for completeness",
      "Add auto-capture of common tool errors to session hooks",
      "Ensure agents log lessons learned after task completion",
    ],
  },
];

// ---------------------------------------------------------------------------
// Scoring — normalize each metric to 0-1 where 1 = perfect
// ---------------------------------------------------------------------------

function normalizeScore(summary: MetricSummary, def: MetricDef): number {
  if (!summary.latest || summary.count === 0) return 0;

  const value = summary.latest.value;

  if (def.direction === "higher_is_better") {
    // 100% reliability -> 1.0, 50% -> 0.5
    return Math.min(1, Math.max(0, value / def.baseline));
  } else {
    // lower_is_better: 0ms -> 1.0, 500ms baseline -> 1.0, 1000ms -> 0.5
    if (value <= 0) return 1; // perfect (or error, but we handle that)
    return Math.min(1, Math.max(0, def.baseline / value));
  }
}

interface RankedMetric {
  name: string;
  score: number; // 0-1 normalized
  rawValue: number;
  unit: string;
  baseline: number;
  trend: string;
  def: MetricDef;
  summary: MetricSummary;
}

function rankMetrics(): RankedMetric[] {
  const summaries = summarizeAll();
  const ranked: RankedMetric[] = [];

  for (const def of METRIC_DEFS) {
    const summary = summaries.find((s) => s.metric === def.name);
    if (!summary) {
      // Missing metric = worst possible score
      ranked.push({
        name: def.name,
        score: 0,
        rawValue: -1,
        unit: def.unit,
        baseline: def.baseline,
        trend: "unknown",
        def,
        summary: {
          metric: def.name,
          latest: null,
          count: 0,
          min: 0,
          max: 0,
          avg: 0,
          trend: "unknown",
        },
      });
      continue;
    }

    const score = normalizeScore(summary, def);
    ranked.push({
      name: def.name,
      score,
      rawValue: summary.latest?.value ?? -1,
      unit: def.unit,
      baseline: def.baseline,
      trend: summary.trend,
      def,
      summary,
    });
  }

  // Sort: worst (lowest score) first
  ranked.sort((a, b) => a.score - b.score);
  return ranked;
}

// ---------------------------------------------------------------------------
// Proposal generation
// ---------------------------------------------------------------------------

interface Proposal {
  timestamp: string;
  metric: string;
  current_value: number;
  baseline: number;
  score: number;
  trend: string;
  hypothesis: string;
  change: string;
  expected_outcome: string;
  measurement: string;
  rollback: string;
}

function generateProposal(target: RankedMetric): Proposal {
  const now = new Date();
  const hint =
    target.def.improvementHints[
      Math.floor(Math.random() * target.def.improvementHints.length)
    ];

  let hypothesis: string;
  let change: string;
  let expectedOutcome: string;
  let measurement: string;
  let rollback: string;

  if (target.rawValue === -1) {
    // Missing metric
    hypothesis = `${target.name} has no data. The collector may not be running.`;
    change = `Run: bun ~/operatoros/lib/collect-metrics.ts and verify ${target.name} gets recorded.`;
    expectedOutcome = `${target.name} metric appears with a valid value.`;
    measurement = `Check ~/operatoros/metrics/${target.name}.jsonl has entries.`;
    rollback = "No code changes needed — this is a data collection issue.";
  } else if (target.def.direction === "lower_is_better") {
    hypothesis = `${target.name} is ${target.rawValue}${target.unit} (baseline: ${target.baseline}${target.unit}). ${hint}`;
    change = hint;
    expectedOutcome = `${target.name} drops to <=${target.baseline}${target.unit}.`;
    measurement = `Run collect-metrics.ts, check ${target.name}.jsonl latest value.`;
    rollback = `Revert any changes to the scripts/hooks that were modified.`;
  } else {
    hypothesis = `${target.name} is ${target.rawValue}${target.unit} (baseline: ${target.baseline}${target.unit}). ${hint}`;
    change = hint;
    expectedOutcome = `${target.name} reaches >=${target.baseline}${target.unit}.`;
    measurement = `Run collect-metrics.ts, check ${target.name}.jsonl latest value.`;
    rollback = `Revert any changes to the scripts/hooks that were modified.`;
  }

  return {
    timestamp: now.toISOString(),
    metric: target.name,
    current_value: target.rawValue,
    baseline: target.baseline,
    score: target.score,
    trend: target.trend,
    hypothesis,
    change,
    expected_outcome: expectedOutcome,
    measurement,
    rollback,
  };
}

function proposalToMarkdown(p: Proposal): string {
  return `# Improvement Proposal: ${p.metric}

**Generated:** ${p.timestamp}
**Target Metric:** ${p.metric}
**Current Value:** ${p.current_value}${METRIC_DEFS.find((d) => d.name === p.metric)?.unit ?? ""}
**Baseline:** ${p.baseline}${METRIC_DEFS.find((d) => d.name === p.metric)?.unit ?? ""}
**Normalized Score:** ${(p.score * 100).toFixed(0)}%
**Trend:** ${p.trend}

## HYPOTHESIS

${p.hypothesis}

## CHANGE

${p.change}

## EXPECTED_OUTCOME

${p.expected_outcome}

## MEASUREMENT

${p.measurement}

## ROLLBACK

${p.rollback}
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  const SHOW_ALL = process.argv.includes("--all");

  const ranked = rankMetrics();

  if (SHOW_ALL) {
    console.log("All metrics ranked (worst first):\n");
    for (const m of ranked) {
      console.log(
        `  ${m.score < 0.8 ? "!" : " "} ${m.name}: ${(m.score * 100).toFixed(0)}% (value=${m.rawValue}${m.unit}, baseline=${m.baseline}${m.unit}, trend=${m.trend})`,
      );
    }
    console.log();
  }

  // Pick the worst metric
  const target = ranked[0];

  if (target.score >= 1.0) {
    console.log("All metrics at or above baseline. Nothing to improve.");
    console.log(JSON.stringify({ picked: null, reason: "all_at_baseline" }));
    return;
  }

  const proposal = generateProposal(target);

  if (DRY_RUN) {
    console.log("Would propose:\n");
    console.log(proposalToMarkdown(proposal));
    return;
  }

  // Write proposal file
  const proposalsDir = join(import.meta.dir, "..", "metrics", "proposals");
  if (!existsSync(proposalsDir)) mkdirSync(proposalsDir, { recursive: true });

  const now = new Date();
  const filename = `${now.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.md`;
  const filepath = join(proposalsDir, filename);

  writeFileSync(filepath, proposalToMarkdown(proposal));

  console.log(`Proposal written: ${filepath}`);
  console.log(
    JSON.stringify(
      {
        picked: target.name,
        score: target.score,
        value: target.rawValue,
        baseline: target.baseline,
        proposal_file: filepath,
      },
      null,
      2,
    ),
  );
}

main();
