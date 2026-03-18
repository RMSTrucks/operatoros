#!/usr/bin/env bun
/**
 * Experiment Runner — takes a proposal, implements the change on a branch,
 * measures before/after, keeps or reverts.
 *
 * Safety: all changes happen on experiment/ branches. Automatic revert on failure.
 * Nothing touches main without a passing metric.
 *
 * Usage:
 *   bun lib/runner.ts                           # run latest proposal
 *   bun lib/runner.ts --proposal <path>         # run specific proposal
 *   bun lib/runner.ts --dry-run                 # show what would happen
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync, mkdirSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { summarize } from "./scorecard.ts";

const HOME = process.env.HOME ?? "/home/jake-deaton";
const OPERATOROS_DIR = resolve(HOME, "operatoros");
const PROPOSALS_DIR = join(OPERATOROS_DIR, "metrics", "proposals");
const EXPERIMENTS_DIR = join(OPERATOROS_DIR, "metrics", "experiments");
const EXPERIMENT_LOG = join(OPERATOROS_DIR, "metrics", "loop-log.jsonl");

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Proposal parsing
// ---------------------------------------------------------------------------

interface ParsedProposal {
  file: string;
  metric: string;
  currentValue: number;
  baseline: number;
  score: number;
  hypothesis: string;
  change: string;
  expectedOutcome: string;
  measurement: string;
  rollback: string;
}

function parseProposal(filepath: string): ParsedProposal {
  const content = readFileSync(filepath, "utf-8");

  const getSection = (name: string): string => {
    const regex = new RegExp(`## ${name}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = content.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  const getField = (name: string): string => {
    const regex = new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`);
    const match = content.match(regex);
    return match?.[1]?.trim() ?? "";
  };

  return {
    file: filepath,
    metric: getField("Target Metric"),
    currentValue: parseFloat(getField("Current Value")) || 0,
    baseline: parseFloat(getField("Baseline")) || 0,
    score: parseFloat(getField("Normalized Score")) || 0,
    hypothesis: getSection("HYPOTHESIS"),
    change: getSection("CHANGE"),
    expectedOutcome: getSection("EXPECTED_OUTCOME"),
    measurement: getSection("MEASUREMENT"),
    rollback: getSection("ROLLBACK"),
  };
}

function findLatestProposal(): string | null {
  if (!existsSync(PROPOSALS_DIR)) return null;

  const files = readdirSync(PROPOSALS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  return files.length > 0 ? join(PROPOSALS_DIR, files[0]) : null;
}

// ---------------------------------------------------------------------------
// Git operations (safe — all on branches)
// ---------------------------------------------------------------------------

function git(args: string[], cwd: string = OPERATOROS_DIR): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 10000 });
  if (result.error) throw result.error;
  return result.stdout.trim();
}

function getCurrentBranch(): string {
  return git(["branch", "--show-current"]);
}

function isClean(): boolean {
  return git(["status", "--porcelain"]).length === 0;
}

function createExperimentBranch(name: string): string {
  const branchName = `experiment/${name}`;
  git(["checkout", "-b", branchName]);
  return branchName;
}

function mergeToMain(branch: string): boolean {
  try {
    git(["checkout", "main"]);
    git(["merge", branch, "--no-edit"]);
    git(["branch", "-d", branch]);
    return true;
  } catch {
    // Merge failed — revert
    git(["merge", "--abort"]);
    git(["checkout", "main"]);
    return false;
  }
}

function revertBranch(branch: string): void {
  try {
    git(["checkout", "main"]);
    git(["branch", "-D", branch]);
  } catch {
    // Best effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Experiment execution
// ---------------------------------------------------------------------------

interface ExperimentResult {
  timestamp: string;
  proposal_file: string;
  metric: string;
  before_value: number;
  after_value: number;
  before_score: number;
  after_score: number;
  improved: boolean;
  kept: boolean;
  branch: string;
  duration_ms: number;
  error?: string;
}

function measureMetric(metricName: string): { value: number; score: number } {
  // Run the collector first
  try {
    execSync("bun lib/collect-metrics.ts", {
      cwd: OPERATOROS_DIR,
      encoding: "utf-8",
      timeout: 30000,
      stdio: "pipe",
    });
  } catch {
    // Collector may partially fail, that's OK
  }

  const summary = summarize(metricName);
  const value = summary.latest?.value ?? -1;

  // Quick normalize (same logic as picker)
  const BASELINES: Record<string, { baseline: number; direction: string }> = {
    "hook-reliability": { baseline: 100, direction: "higher" },
    "vault-freshness": { baseline: 1, direction: "lower" },
    "session-start-time": { baseline: 500, direction: "lower" },
    "handoff-quality": { baseline: 1.0, direction: "higher" },
    "knowledge-capture": { baseline: 20, direction: "higher" },
  };

  const def = BASELINES[metricName];
  let score = 0;
  if (def) {
    if (def.direction === "higher") {
      score = Math.min(1, Math.max(0, value / def.baseline));
    } else {
      score = value <= 0 ? 1 : Math.min(1, Math.max(0, def.baseline / value));
    }
  }

  return { value, score };
}

async function implementChange(proposal: ParsedProposal): Promise<boolean> {
  // Use Claude CLI in headless mode to implement the change
  const prompt = `You are improving the OperatorOS system in ~/operatoros.

The current problem: ${proposal.hypothesis}

The proposed change: ${proposal.change}

Expected outcome: ${proposal.expectedOutcome}

Instructions:
1. Read the relevant files to understand the current state
2. Make the minimal change needed to improve the "${proposal.metric}" metric
3. Do NOT make unrelated changes
4. Keep changes small and safe

If you cannot make a meaningful change, just explain why in a comment.`;

  try {
    const result = spawnSync(
      "claude",
      ["-p", prompt, "--output-format", "text", "--max-turns", "10"],
      {
        cwd: OPERATOROS_DIR,
        encoding: "utf-8",
        timeout: 120000, // 2 min max
        stdio: "pipe",
        env: {
          ...process.env,
          CLAUDECODE: undefined,
          CLAUDE_CODE_SESSION: undefined,
        },
      },
    );

    if (result.error) {
      console.log(`  Claude CLI error: ${result.error.message}`);
      return false;
    }

    console.log(`  Claude output: ${(result.stdout || "").slice(0, 200)}`);

    // Check if any files were changed
    const status = git(["status", "--porcelain"]);
    if (!status) {
      console.log("  No files changed by Claude");
      return false;
    }

    // Stage and commit changes
    git(["add", "-A"]);
    git(["commit", "-m", `experiment: improve ${proposal.metric}\n\n${proposal.hypothesis.slice(0, 200)}`]);
    return true;
  } catch (e) {
    console.log(`  Implementation failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function runExperiment(proposal: ParsedProposal): Promise<ExperimentResult> {
  const startTime = Date.now();
  const now = new Date();
  const branchName = now.toISOString().slice(0, 16).replace(/[T:]/g, "-");

  console.log(`\nExperiment: ${proposal.metric}`);
  console.log(`  Proposal: ${proposal.file}`);
  console.log(`  Hypothesis: ${proposal.hypothesis.slice(0, 100)}`);

  // Ensure we're on main and clean
  const currentBranch = getCurrentBranch();
  if (currentBranch !== "main") {
    console.log(`  WARNING: Not on main (on ${currentBranch}), switching...`);
    git(["checkout", "main"]);
  }

  if (!isClean()) {
    console.log("  WARNING: Working tree not clean, stashing...");
    git(["stash"]);
  }

  // 1. Measure BEFORE
  console.log("  Measuring before state...");
  const before = measureMetric(proposal.metric);
  console.log(`  Before: value=${before.value}, score=${(before.score * 100).toFixed(0)}%`);

  if (DRY_RUN) {
    return {
      timestamp: now.toISOString(),
      proposal_file: proposal.file,
      metric: proposal.metric,
      before_value: before.value,
      after_value: before.value,
      before_score: before.score,
      after_score: before.score,
      improved: false,
      kept: false,
      branch: `experiment/${branchName}`,
      duration_ms: Date.now() - startTime,
      error: "dry_run",
    };
  }

  // 2. Create experiment branch
  let branch: string;
  try {
    branch = createExperimentBranch(branchName);
  } catch (e) {
    return {
      timestamp: now.toISOString(),
      proposal_file: proposal.file,
      metric: proposal.metric,
      before_value: before.value,
      after_value: before.value,
      before_score: before.score,
      after_score: before.score,
      improved: false,
      kept: false,
      branch: `experiment/${branchName}`,
      duration_ms: Date.now() - startTime,
      error: `branch_create_failed: ${e}`,
    };
  }

  console.log(`  Branch: ${branch}`);

  // 3. Implement the change
  console.log("  Implementing change...");
  const implemented = await implementChange(proposal);

  if (!implemented) {
    console.log("  No changes made, reverting branch");
    revertBranch(branch);
    return {
      timestamp: now.toISOString(),
      proposal_file: proposal.file,
      metric: proposal.metric,
      before_value: before.value,
      after_value: before.value,
      before_score: before.score,
      after_score: before.score,
      improved: false,
      kept: false,
      branch,
      duration_ms: Date.now() - startTime,
      error: "no_changes_made",
    };
  }

  // 4. Measure AFTER
  console.log("  Measuring after state...");
  const after = measureMetric(proposal.metric);
  console.log(`  After: value=${after.value}, score=${(after.score * 100).toFixed(0)}%`);

  // 5. Compare
  const improved = after.score > before.score;
  console.log(`  ${improved ? "IMPROVED" : "NOT IMPROVED"}: ${(before.score * 100).toFixed(0)}% -> ${(after.score * 100).toFixed(0)}%`);

  // 6. Keep or revert
  let kept = false;
  if (improved) {
    console.log("  Merging to main...");
    kept = mergeToMain(branch);
    if (kept) {
      console.log("  Merged successfully");
    } else {
      console.log("  Merge failed, reverting");
      revertBranch(branch);
    }
  } else {
    console.log("  Reverting branch...");
    revertBranch(branch);
  }

  return {
    timestamp: now.toISOString(),
    proposal_file: proposal.file,
    metric: proposal.metric,
    before_value: before.value,
    after_value: after.value,
    before_score: before.score,
    after_score: after.score,
    improved,
    kept,
    branch,
    duration_ms: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logResult(result: ExperimentResult): void {
  if (!existsSync(EXPERIMENTS_DIR)) mkdirSync(EXPERIMENTS_DIR, { recursive: true });

  // Per-experiment log
  const expFile = join(
    EXPERIMENTS_DIR,
    `${result.timestamp.slice(0, 16).replace(/[T:]/g, "-")}.jsonl`,
  );
  appendFileSync(expFile, JSON.stringify(result) + "\n");

  // Global loop log
  appendFileSync(EXPERIMENT_LOG, JSON.stringify(result) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const proposalArg = process.argv.find((_, i) => process.argv[i - 1] === "--proposal");
  const proposalPath = proposalArg ?? findLatestProposal();

  if (!proposalPath) {
    console.log("No proposals found. Run the picker first: bun lib/picker.ts");
    process.exit(0);
  }

  if (!existsSync(proposalPath)) {
    console.log(`Proposal not found: ${proposalPath}`);
    process.exit(1);
  }

  console.log(`Loading proposal: ${proposalPath}`);
  const proposal = parseProposal(proposalPath);

  if (!proposal.metric) {
    console.log("Could not parse metric from proposal");
    process.exit(1);
  }

  const result = await runExperiment(proposal);
  logResult(result);

  console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
  process.exit(result.error && result.error !== "dry_run" ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
