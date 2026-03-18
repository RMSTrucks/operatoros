/**
 * Correction Pattern Detector — finds recurring mistake categories in tool-lessons.
 *
 * Reads ops/tool-lessons.md (pipe-delimited table rows) and clusters errors
 * by pattern to surface what the agent keeps getting wrong.
 *
 * Usage:
 *   import { detectPatterns } from "./correction-detector";
 *   const report = detectPatterns("/path/to/vault");
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LessonEntry {
  date: string;
  tool: string;
  command: string;
  error: string;
}

export interface CorrectionPattern {
  category: string;
  count: number;
  entries: LessonEntry[];
  firstSeen: string;
  lastSeen: string;
  suggestion: string;
}

export interface DetectionReport {
  totalLessons: number;
  patterns: CorrectionPattern[];
  topRepeaters: CorrectionPattern[];
  recentWindow: number; // days analyzed
}

// ---------------------------------------------------------------------------
// Error categories — ordered by specificity (first match wins)
// ---------------------------------------------------------------------------

const CATEGORIES: Array<{ name: string; test: (cmd: string, err: string) => boolean; suggestion: string }> = [
  {
    name: "file-not-found",
    test: (_cmd, err) => /no such file|not found|ENOENT/i.test(err),
    suggestion: "Check file existence before operating. Use `test -f` or `existsSync`.",
  },
  {
    name: "permission-denied",
    test: (_cmd, err) => /permission denied|EACCES/i.test(err),
    suggestion: "Check file permissions. Avoid writing to protected paths.",
  },
  {
    name: "command-not-found",
    test: (_cmd, err) => /command not found/i.test(err),
    suggestion: "Verify tool is installed before using it. Check PATH.",
  },
  {
    name: "syntax-error",
    test: (_cmd, err) => /SyntaxError|syntax error|unexpected token/i.test(err),
    suggestion: "Validate syntax before execution. Use linters or dry-run flags.",
  },
  {
    name: "type-error",
    test: (_cmd, err) => /TypeError|type error/i.test(err),
    suggestion: "Check types at boundaries. Use TypeScript strict mode.",
  },
  {
    name: "import-error",
    test: (_cmd, err) => /ModuleNotFoundError|ImportError|Cannot find module/i.test(err),
    suggestion: "Verify module exists and dependencies are installed.",
  },
  {
    name: "json-parse",
    test: (_cmd, err) => /JSON\.parse|Unexpected token.*JSON|invalid json/i.test(err),
    suggestion: "Validate JSON before parsing. Check for empty responses.",
  },
  {
    name: "network-error",
    test: (_cmd, err) => /ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(err),
    suggestion: "Check service availability before calling. Add retry/timeout handling.",
  },
  {
    name: "git-error",
    test: (cmd, err) => /^git\s/i.test(cmd) && /fatal:|error:/i.test(err),
    suggestion: "Check git state (branch, remote, clean) before git operations.",
  },
  {
    name: "api-error",
    test: (_cmd, err) => /4\d{2}|5\d{2}|unauthorized|forbidden|rate limit/i.test(err),
    suggestion: "Check auth tokens and API limits. Validate request shape.",
  },
  {
    name: "uncategorized",
    test: () => true,
    suggestion: "Review the error context and add a specific category if this recurs.",
  },
];

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseLessons(vaultDir: string): LessonEntry[] {
  const lessonsPath = join(vaultDir, "ops", "tool-lessons.md");
  if (!existsSync(lessonsPath)) return [];

  const content = readFileSync(lessonsPath, "utf-8");
  const entries: LessonEntry[] = [];

  for (const line of content.split("\n")) {
    // Match table rows: | date | tool | command | error |
    const match = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\w+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
    if (match) {
      entries.push({
        date: match[1],
        tool: match[2],
        command: match[3].trim(),
        error: match[4].trim(),
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function classify(entry: LessonEntry): string {
  for (const cat of CATEGORIES) {
    if (cat.test(entry.command, entry.error)) {
      return cat.name;
    }
  }
  return "uncategorized";
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export function detectPatterns(vaultDir: string, recentDays = 30): DetectionReport {
  const entries = parseLessons(vaultDir);

  // Filter to recent window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recentDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = entries.filter((e) => e.date >= cutoffStr);

  // Group by category
  const groups = new Map<string, LessonEntry[]>();
  for (const entry of recent) {
    const cat = classify(entry);
    const list = groups.get(cat) ?? [];
    list.push(entry);
    groups.set(cat, list);
  }

  // Build patterns
  const patterns: CorrectionPattern[] = [];
  for (const [category, grouped] of groups) {
    const catDef = CATEGORIES.find((c) => c.name === category);
    const dates = grouped.map((e) => e.date).sort();
    patterns.push({
      category,
      count: grouped.length,
      entries: grouped,
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
      suggestion: catDef?.suggestion ?? "No suggestion available.",
    });
  }

  // Sort by frequency (most common first)
  patterns.sort((a, b) => b.count - a.count);

  // Top repeaters: patterns with 3+ occurrences
  const topRepeaters = patterns.filter((p) => p.count >= 3);

  return {
    totalLessons: recent.length,
    patterns,
    topRepeaters,
    recentWindow: recentDays,
  };
}

// ---------------------------------------------------------------------------
// Pretty printer
// ---------------------------------------------------------------------------

export function formatReport(report: DetectionReport): string {
  const lines: string[] = [];
  lines.push(`# Correction Pattern Report`);
  lines.push(`Analyzed ${report.totalLessons} lessons from last ${report.recentWindow} days\n`);

  if (report.totalLessons === 0) {
    lines.push("No tool failures recorded. Either everything works or capture-lessons hook is not active.");
    return lines.join("\n");
  }

  if (report.topRepeaters.length > 0) {
    lines.push("## Recurring Patterns (3+ occurrences)\n");
    for (const p of report.topRepeaters) {
      lines.push(`### ${p.category} (${p.count}x, ${p.firstSeen} - ${p.lastSeen})`);
      lines.push(`> ${p.suggestion}\n`);
      // Show last 3 examples
      for (const e of p.entries.slice(-3)) {
        lines.push(`- \`${e.command.slice(0, 60)}\` -> ${e.error.slice(0, 80)}`);
      }
      lines.push("");
    }
  }

  lines.push("## All Categories\n");
  lines.push("| Category | Count | Last Seen |");
  lines.push("|----------|-------|-----------|");
  for (const p of report.patterns) {
    lines.push(`| ${p.category} | ${p.count} | ${p.lastSeen} |`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const vaultDir = process.argv[2] ?? join(process.env.HOME ?? "", ".claude/projects/-home-jake-deaton/memory");
  const days = parseInt(process.argv[3] ?? "30", 10);
  const report = detectPatterns(vaultDir, days);
  console.log(formatReport(report));
}
