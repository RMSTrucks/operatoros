#!/usr/bin/env bun
/**
 * fitness-score.ts — The ground truth for self-improvement.
 *
 * Computes a composite score (0-100) from system-attributable metrics.
 * This is the anchor — the one thing the hyperagent can't edit.
 *
 * Components are pluggable. Override getComponents() for your deployment.
 *
 * Usage:
 *   bun lib/operator/fitness-score.ts              # compute + print
 *   bun lib/operator/fitness-score.ts --json       # machine-readable
 *   bun lib/operator/fitness-score.ts --history    # show trend
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";

const HOME = process.env.HOME || "";
const DB_DIR = resolve(HOME, ".operatoros/data");
const DB_PATH = resolve(DB_DIR, "fitness.db");
const JSON_OUTPUT = process.argv.includes("--json");
const SHOW_HISTORY = process.argv.includes("--history");

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

import { mkdirSync } from "node:fs";
mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA busy_timeout=5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS fitness_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    score REAL NOT NULL,
    components TEXT NOT NULL,
    computed_at TEXT NOT NULL
  )
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComponentScore {
  name: string;
  score: number;      // 0-100
  weight: number;     // relative weight (will be normalized)
  detail: string;
}

export interface FitnessResult {
  score: number;
  components: ComponentScore[];
  computed_at: string;
}

// ---------------------------------------------------------------------------
// Default components — override these for your deployment
// ---------------------------------------------------------------------------

async function scoreSystemUptime(): Promise<ComponentScore> {
  // Check if common services are responding
  const services = [
    { name: "observatory", url: "http://127.0.0.1:9201/" },
    { name: "knowledge", url: "http://127.0.0.1:9200/" },
  ];

  let up = 0;
  let total = 0;

  for (const svc of services) {
    total++;
    try {
      const resp = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) up++;
    } catch {}
  }

  // Also check systemd services if available
  try {
    const { execSync } = await import("node:child_process");
    const result = execSync("systemctl --user list-units --state=active --no-pager 2>/dev/null | grep -c '.service'", { encoding: "utf-8" }).trim();
    const activeCount = parseInt(result) || 0;
    if (activeCount > 0) {
      // At least some services running
      total++;
      up++;
    }
  } catch {}

  const score = total > 0 ? Math.round((up / total) * 100) : 50;
  return { name: "system_uptime", score, weight: 25, detail: `${up}/${total} checks passing` };
}

async function scoreKnowledgeGrowth(): Promise<ComponentScore> {
  // Check if knowledge server has entries and is growing
  try {
    const resp = await fetch("http://127.0.0.1:9200/", { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json() as any;
      const entries = data.entries || 0;
      const score = Math.min(100, Math.round((entries / 100) * 50) + 50);
      return { name: "knowledge_growth", score, weight: 20, detail: `${entries} entries` };
    }
  } catch {}
  return { name: "knowledge_growth", score: 50, weight: 20, detail: "Knowledge server not available" };
}

async function scoreAutonomy(): Promise<ComponentScore> {
  // Measure how many recent fitness scores exist (system is running autonomously)
  const count = db.query(
    "SELECT COUNT(*) as c FROM fitness_history WHERE computed_at > datetime('now', '-7 days')"
  ).get() as any;

  const measurements = count?.c || 0;
  // 84 measurements in 7 days (every 2 hours) = fully autonomous
  const score = Math.min(100, Math.round((measurements / 84) * 100));
  return { name: "autonomy", score, weight: 25, detail: `${measurements} measurements in 7 days` };
}

async function scoreSelfHeal(): Promise<ComponentScore> {
  // Check if self-heal timer is running
  try {
    const { execSync } = await import("node:child_process");
    const result = execSync("systemctl --user is-active self-heal.timer 2>/dev/null", { encoding: "utf-8" }).trim();
    if (result === "active") {
      return { name: "self_heal", score: 100, weight: 15, detail: "Self-heal timer active" };
    }
  } catch {}
  return { name: "self_heal", score: 0, weight: 15, detail: "Self-heal not running" };
}

async function scoreMemory(): Promise<ComponentScore> {
  // Check if operator memory (Entity DO or local files) exists and has content
  const vaultDir = resolve(HOME, ".claude/projects");
  const hyperDir = resolve(HOME, ".openclaw/hyperagent");

  let score = 0;
  const details: string[] = [];

  // Check vault exists
  if (existsSync(vaultDir)) {
    score += 30;
    details.push("vault exists");
  }

  // Check hyperagent archive
  if (existsSync(resolve(hyperDir, "archive.db"))) {
    const archiveDb = new Database(resolve(hyperDir, "archive.db"), { readonly: true });
    const count = archiveDb.query("SELECT COUNT(*) as c FROM archive").get() as any;
    archiveDb.close();
    const generations = count?.c || 0;
    score += Math.min(40, generations * 10);
    details.push(`${generations} generations`);
  }

  // Check modifications exist
  if (existsSync(resolve(hyperDir, "operator-modifications.md"))) {
    const content = readFileSync(resolve(hyperDir, "operator-modifications.md"), "utf-8");
    if (content.length > 200) {
      score += 30;
      details.push("active modifications");
    }
  }

  return { name: "memory", score: Math.min(100, score), weight: 15, detail: details.join(", ") || "no memory yet" };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------

export async function computeFitness(): Promise<FitnessResult> {
  const components = await Promise.all([
    scoreSystemUptime(),
    scoreKnowledgeGrowth(),
    scoreAutonomy(),
    scoreSelfHeal(),
    scoreMemory(),
  ]);

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const weightedSum = components.reduce((s, c) => s + c.score * c.weight, 0);
  const score = Math.round(weightedSum / totalWeight);

  const result: FitnessResult = {
    score,
    components,
    computed_at: new Date().toISOString(),
  };

  // Store
  db.prepare("INSERT INTO fitness_history (score, components, computed_at) VALUES (?, ?, ?)")
    .run(score, JSON.stringify(components), result.computed_at);

  return result;
}

export function getFitnessHistory(days: number = 14): { day: string; avg: number; samples: number }[] {
  const rows = db.query(`
    SELECT date(computed_at) as day, AVG(score) as avg, COUNT(*) as samples
    FROM fitness_history
    WHERE computed_at > datetime('now', '-' || ? || ' days')
    GROUP BY date(computed_at)
    ORDER BY day
  `).all(days) as any[];

  return rows.map(r => ({ day: r.day, avg: Math.round(r.avg), samples: r.samples }));
}

export function getLatestFitness(): FitnessResult | null {
  const row = db.query(
    "SELECT score, components, computed_at FROM fitness_history ORDER BY id DESC LIMIT 1"
  ).get() as any;

  if (!row) return null;
  return {
    score: row.score,
    components: JSON.parse(row.components),
    computed_at: row.computed_at,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  if (SHOW_HISTORY) {
    const history = getFitnessHistory();
    if (history.length === 0) {
      console.log("No history yet. Run without --history to compute the first score.");
      return;
    }
    console.log("\nFITNESS TREND (14 days)\n");
    for (const day of history) {
      const bar = "#".repeat(Math.round(day.avg / 2));
      console.log(`  ${day.day}  ${bar} ${day.avg}/100 (${day.samples} samples)`);
    }
    return;
  }

  const result = await computeFitness();

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nFITNESS SCORE: ${result.score}/100\n`);
  for (const c of result.components) {
    const bar = "=".repeat(Math.round(c.score / 5));
    const pad = " ".repeat(18 - c.name.length);
    console.log(`  ${c.name}${pad} ${bar} ${c.score}/100 (${c.weight}%)`);
    console.log(`  ${" ".repeat(18)} ${c.detail}`);
  }
  console.log();
}

void main().catch(e => { console.error(e.message); process.exit(1); });
