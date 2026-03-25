#!/usr/bin/env bun
/**
 * hyperagent.ts — Self-referential operator improvement.
 *
 * Three editable files (the "program"):
 *   1. operator-modifications.md  — self-written rules/priorities
 *   2. operator-meta-strategy.md  — how I decide what to modify
 *   3. operator-eval-criteria.md  — how I evaluate whether a modification worked
 *
 * One fixed anchor:
 *   - Fitness score (external, can't be gamed)
 *
 * Usage:
 *   bun lib/operator/hyperagent.ts                # run one cycle
 *   bun lib/operator/hyperagent.ts --status       # show archive
 *   bun lib/operator/hyperagent.ts --revert       # revert last change
 *   bun lib/operator/hyperagent.ts --dry-run      # propose but don't apply
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { getLatestFitness, computeFitness, type FitnessResult } from "./fitness-score";

const HOME = process.env.HOME || "";
const DRY_RUN = process.argv.includes("--dry-run");
const SHOW_STATUS = process.argv.includes("--status");
const REVERT = process.argv.includes("--revert");

const HYPER_DIR = resolve(HOME, ".openclaw/hyperagent");
const DB_PATH = resolve(HYPER_DIR, "archive.db");
const MODIFICATIONS_PATH = resolve(HYPER_DIR, "operator-modifications.md");
const META_STRATEGY_PATH = resolve(HYPER_DIR, "operator-meta-strategy.md");
const EVAL_CRITERIA_PATH = resolve(HYPER_DIR, "operator-eval-criteria.md");

mkdirSync(HYPER_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA busy_timeout=5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation INTEGER NOT NULL,
    target TEXT NOT NULL,
    change_description TEXT NOT NULL,
    rationale TEXT NOT NULL,
    content_before TEXT NOT NULL,
    content_after TEXT NOT NULL,
    fitness_before REAL,
    fitness_after REAL,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    evaluated_at TEXT,
    evaluation TEXT
  )
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentGeneration(): number {
  const row = db.query("SELECT MAX(generation) as g FROM archive").get() as any;
  return row?.g || 0;
}

function readFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

// ---------------------------------------------------------------------------
// Evaluate previous change
// ---------------------------------------------------------------------------

async function evaluatePrevious(): Promise<{ action: "keep" | "revert" | "wait" | "none"; detail: string }> {
  const last = db.query("SELECT * FROM archive WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as any;
  if (!last) return { action: "none", detail: "No previous modifications" };

  const fitness = getLatestFitness() || await computeFitness();
  const created = new Date(last.created_at).getTime();
  const hours = (Date.now() - created) / (1000 * 60 * 60);

  if (hours < 2) {
    return { action: "wait", detail: `Only ${hours.toFixed(1)}h since last change (need 2h)` };
  }

  const delta = fitness.score - (last.fitness_before || 0);

  if (delta < -3) {
    db.prepare("UPDATE archive SET status = 'reverted', fitness_after = ?, evaluated_at = ?, evaluation = ? WHERE id = ?")
      .run(fitness.score, new Date().toISOString(), `BAD: delta=${delta}`, last.id);
    return { action: "revert", detail: `Fitness dropped ${delta} (${last.fitness_before}->${fitness.score})` };
  }

  if (Math.abs(delta) <= 2) {
    if (last.evaluation?.startsWith("NEUTRAL")) {
      db.prepare("UPDATE archive SET status = 'proven', fitness_after = ?, evaluated_at = ?, evaluation = ? WHERE id = ?")
        .run(fitness.score, new Date().toISOString(), `NEUTRAL->KEPT: delta=${delta}`, last.id);
      return { action: "keep", detail: `Neutral after two cycles. Keeping.` };
    }
    db.prepare("UPDATE archive SET evaluation = ? WHERE id = ?")
      .run(`NEUTRAL: delta=${delta}`, last.id);
    return { action: "wait", detail: `Neutral (delta=${delta}). Waiting one more cycle.` };
  }

  db.prepare("UPDATE archive SET status = 'proven', fitness_after = ?, evaluated_at = ?, evaluation = ? WHERE id = ?")
    .run(fitness.score, new Date().toISOString(), `GOOD: delta=+${delta}`, last.id);
  return { action: "keep", detail: `Fitness improved +${delta}!` };
}

function revertLast(): string {
  const last = db.query("SELECT * FROM archive WHERE status IN ('active','reverted') ORDER BY id DESC LIMIT 1").get() as any;
  if (!last) return "Nothing to revert.";

  const path = last.target === "modifications" ? MODIFICATIONS_PATH
    : last.target === "meta-strategy" ? META_STRATEGY_PATH
    : last.target === "eval-criteria" ? EVAL_CRITERIA_PATH : null;

  if (!path) return `Unknown target: ${last.target}`;
  writeFileSync(path, last.content_before);
  db.prepare("UPDATE archive SET status = 'reverted', evaluated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), last.id);
  return `Reverted generation ${last.generation}`;
}

// ---------------------------------------------------------------------------
// Propose modification (uses LLM)
// ---------------------------------------------------------------------------

async function proposeModification(fitness: FitnessResult): Promise<{
  target: string; description: string; rationale: string; newContent: string;
} | null> {
  const currentMods = readFile(MODIFICATIONS_PATH);
  const metaStrategy = readFile(META_STRATEGY_PATH);

  // Find weakest component
  let weakest = { name: "unknown", score: 100, detail: "" };
  for (const c of fitness.components) {
    if (c.score < weakest.score) weakest = { name: c.name, score: c.score, detail: c.detail };
  }

  const archiveRows = db.query("SELECT generation, target, change_description, status, evaluation FROM archive ORDER BY id DESC LIMIT 10").all() as any[];
  const archiveContext = archiveRows.map(a => `Gen ${a.generation} [${a.status}]: ${a.change_description}`).join("\n") || "(none)";

  const prompt = `You are a self-improving AI operator. Your fitness score is ${fitness.score}/100.

Weakest component: ${weakest.name} (${weakest.score}/100) — ${weakest.detail}

All components:
${fitness.components.map(c => `  ${c.name}: ${c.score}/100 — ${c.detail}`).join("\n")}

Current self-modifications:
${currentMods}

Meta-strategy (how you decide what to change):
${metaStrategy}

Archive (recent changes):
${archiveContext}

Propose ONE modification to improve your weakest component. Target one of: modifications, meta-strategy, eval-criteria.

If fitness is above 90, respond: NO_CHANGE

Format:
TARGET: <modifications | meta-strategy | eval-criteria>
DESCRIPTION: <1-2 sentences>
RATIONALE: <why, citing fitness data>
NEW_CONTENT: <complete new file content>`;

  // Try available LLM providers in order
  const response = await callLLM(prompt);
  if (!response || response === "NO_CHANGE") return null;

  // Strip code fences
  const clean = response.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();

  const targetMatch = clean.match(/TARGET:\s*(modifications|meta-strategy|eval-criteria)/i);
  const descMatch = clean.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
  const rationaleMatch = clean.match(/RATIONALE:\s*(.+?)(?:\n(?:NEW_CONTENT|$))/is);
  const contentMatch = clean.match(/NEW_CONTENT:\s*([\s\S]+)$/i);

  if (!targetMatch || !descMatch || !contentMatch) return null;

  return {
    target: targetMatch[1].toLowerCase(),
    description: descMatch[1].trim(),
    rationale: rationaleMatch?.[1]?.trim() || "",
    newContent: contentMatch[1].trim(),
  };
}

// ---------------------------------------------------------------------------
// LLM provider — tries Gemini, then OpenRouter, then Claude CLI
// ---------------------------------------------------------------------------

async function callLLM(prompt: string): Promise<string> {
  // Read available keys
  const envPath = resolve(HOME, ".openclaw/.env");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const geminiKey = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
  const orKey = env.match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim();

  // Try Gemini (free tier)
  if (geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 4096 } }),
          signal: AbortSignal.timeout(120_000),
        }
      );
      if (resp.ok) {
        const data = await resp.json() as any;
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    } catch {}
  }

  // Try OpenRouter
  if (orKey) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${orKey}` },
        body: JSON.stringify({ model: "anthropic/claude-sonnet-4", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(120_000),
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        return data.choices?.[0]?.message?.content || "";
      }
    } catch {}
  }

  // Try Claude CLI
  try {
    const { execSync } = await import("node:child_process");
    const tmpFile = `/tmp/hyperagent-${Date.now()}.txt`;
    await Bun.write(tmpFile, prompt);
    const result = execSync(
      `unset CLAUDECODE CLAUDE_CODE_SESSION ANTHROPIC_API_KEY; cat "${tmpFile}" | claude -p --output-format text --max-turns 1 --model haiku`,
      { encoding: "utf-8", timeout: 120_000 }
    ).trim();
    return result;
  } catch {}

  console.log("[hyper] No LLM provider available. Set GEMINI_API_KEY or OPENROUTER_API_KEY in ~/.openclaw/.env");
  return "";
}

// ---------------------------------------------------------------------------
// Apply modification
// ---------------------------------------------------------------------------

function applyModification(proposal: { target: string; description: string; rationale: string; newContent: string }, fitness: number) {
  const gen = currentGeneration() + 1;
  const path = proposal.target === "modifications" ? MODIFICATIONS_PATH
    : proposal.target === "meta-strategy" ? META_STRATEGY_PATH
    : proposal.target === "eval-criteria" ? EVAL_CRITERIA_PATH : null;

  if (!path) return;

  const before = readFile(path);
  db.prepare(`INSERT INTO archive (generation, target, change_description, rationale, content_before, content_after, fitness_before, status, created_at) VALUES (?,?,?,?,?,?,?,'active',?)`)
    .run(gen, proposal.target, proposal.description, proposal.rationale, before, proposal.newContent, fitness, new Date().toISOString());

  if (!DRY_RUN) {
    writeFileSync(path, proposal.newContent);
    console.log(`[hyper] Applied generation ${gen}: ${proposal.description}`);
  } else {
    console.log(`[hyper] DRY RUN — would apply generation ${gen}: ${proposal.description}`);
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function showStatus() {
  const gen = currentGeneration();
  const active = (db.query("SELECT COUNT(*) as c FROM archive WHERE status='active'").get() as any)?.c || 0;
  const proven = (db.query("SELECT COUNT(*) as c FROM archive WHERE status='proven'").get() as any)?.c || 0;
  const reverted = (db.query("SELECT COUNT(*) as c FROM archive WHERE status='reverted'").get() as any)?.c || 0;

  console.log(`\nHYPERAGENT STATUS\n`);
  console.log(`  Generation: ${gen}`);
  console.log(`  Active: ${active}  Proven: ${proven}  Reverted: ${reverted}`);

  const recent = db.query("SELECT generation, target, change_description, status, evaluation, fitness_before, fitness_after FROM archive ORDER BY id DESC LIMIT 5").all() as any[];
  if (recent.length) {
    console.log(`\n  Recent:`);
    for (const r of recent) {
      console.log(`    Gen ${r.generation} [${r.status}]: ${r.change_description}`);
      if (r.evaluation) console.log(`      ${r.evaluation}`);
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (SHOW_STATUS) { showStatus(); return; }
  if (REVERT) { console.log(revertLast()); return; }

  console.log("[hyper] Starting cycle...\n");

  const evalResult = await evaluatePrevious();
  console.log(`[hyper] Previous: ${evalResult.action} — ${evalResult.detail}`);

  if (evalResult.action === "revert") console.log(`[hyper] ${revertLast()}`);
  if (evalResult.action === "wait") return;

  const fitness = getLatestFitness() || await computeFitness();
  console.log(`[hyper] Fitness: ${fitness.score}/100`);

  console.log("[hyper] Generating proposal...");
  const proposal = await proposeModification(fitness);

  if (!proposal) {
    console.log("[hyper] No change proposed.");
    return;
  }

  console.log(`[hyper] Target: ${proposal.target}`);
  console.log(`[hyper] Description: ${proposal.description}`);
  applyModification(proposal, fitness.score);
}

void main().catch(e => { console.error(e.message); process.exit(1); });
