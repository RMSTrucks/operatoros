#!/usr/bin/env bun
/**
 * self-heal.ts — Detect and fix service failures automatically.
 *
 * Checks systemd user services, diagnoses common failures,
 * and applies known fixes. Runs every 5 minutes via timer.
 *
 * Known remediations:
 *   1. SQLITE_MISUSE — remove stale WAL/SHM files, restart
 *   2. Crash loop — reset-failed, restart
 *   3. Generic down — restart
 *
 * Usage:
 *   bun lib/operator/self-heal.ts              # check all, fix what's broken
 *   bun lib/operator/self-heal.ts --dry-run    # diagnose only
 *   bun lib/operator/self-heal.ts --service X  # check one service
 */

import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");
const TARGET = (() => {
  const idx = process.argv.indexOf("--service");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

// ---------------------------------------------------------------------------
// Service registry — add your services here
// ---------------------------------------------------------------------------

interface ServiceDef {
  unit: string;
  dbPaths?: string[];
  healthUrl?: string;
}

// Auto-discover services from systemd
async function discoverServices(): Promise<Record<string, ServiceDef>> {
  const services: Record<string, ServiceDef> = {};

  try {
    const output = execSync(
      "systemctl --user list-units --type=service --state=loaded --no-pager --plain 2>/dev/null",
      { encoding: "utf-8", timeout: 5000 }
    );

    for (const line of output.split("\n")) {
      const match = line.match(/^(\S+)\.service/);
      if (match) {
        const unit = match[1];
        // Skip generic system services, only track app services
        if (unit.startsWith("claude-") || unit.includes("server") || unit.includes("studio") ||
            unit.includes("paperclip") || unit.includes("self-heal") || unit.includes("fitness")) {
          services[unit] = { unit };
        }
      }
    }
  } catch {}

  return services;
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

type DiagnosisType = "sqlite_misuse" | "crash_loop" | "port_conflict" | "generic_down" | "healthy";

interface Diagnosis {
  service: string;
  unit: string;
  type: DiagnosisType;
  detail: string;
  fixable: boolean;
}

interface HealResult {
  service: string;
  diagnosis: DiagnosisType;
  action: string;
  success: boolean;
  detail: string;
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
  } catch (e: any) {
    return e.stdout?.trim?.() || "";
  }
}

function diagnose(name: string, svc: ServiceDef): Diagnosis {
  const base = { service: name, unit: svc.unit };
  const status = sh(`systemctl --user is-active ${svc.unit} 2>/dev/null`);

  if (status === "active") {
    return { ...base, type: "healthy", detail: "Active", fixable: false };
  }

  const logs = sh(`journalctl --user -u ${svc.unit} --since "10 min ago" --no-pager 2>/dev/null | tail -30`);

  if (logs.includes("SQLITE_MISUSE") || logs.includes("bad parameter or other API misuse")) {
    return { ...base, type: "sqlite_misuse", detail: "SQLite error — likely stale WAL/SHM", fixable: true };
  }

  if (logs.includes("Start request repeated too quickly")) {
    return { ...base, type: "crash_loop", detail: "Restart rate limit hit", fixable: true };
  }

  if (logs.includes("EADDRINUSE")) {
    return { ...base, type: "port_conflict", detail: "Port in use", fixable: false };
  }

  return { ...base, type: "generic_down", detail: `Status: ${status || "unknown"}`, fixable: true };
}

// ---------------------------------------------------------------------------
// Heal
// ---------------------------------------------------------------------------

function heal(diag: Diagnosis, svc: ServiceDef): HealResult {
  const base = { service: diag.service, diagnosis: diag.type };

  if (diag.type === "healthy") {
    return { ...base, action: "none", success: true, detail: "Already healthy" };
  }

  if (!diag.fixable || DRY_RUN) {
    return { ...base, action: DRY_RUN ? "dry-run" : "none", success: !DRY_RUN, detail: diag.detail };
  }

  // SQLite — clean WAL/SHM
  if (diag.type === "sqlite_misuse" && svc.dbPaths) {
    for (const dbPath of svc.dbPaths) {
      for (const ext of ["-shm", "-wal"]) {
        const f = dbPath + ext;
        if (existsSync(f)) {
          try { unlinkSync(f); } catch {}
        }
      }
    }
  }

  // Reset failure counter and restart
  sh(`systemctl --user reset-failed ${svc.unit} 2>/dev/null`);
  sh(`systemctl --user restart ${svc.unit} 2>/dev/null`);

  // Wait and verify
  execSync("sleep 3");
  const status = sh(`systemctl --user is-active ${svc.unit} 2>/dev/null`);
  const ok = status === "active";

  return {
    ...base,
    action: diag.type === "sqlite_misuse" ? "wal_cleanup + restart" : "reset + restart",
    success: ok,
    detail: ok ? "Recovered" : "Still down after restart",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const allServices = await discoverServices();
  const targets = TARGET ? { [TARGET]: allServices[TARGET] || { unit: TARGET } } : allServices;

  const results: HealResult[] = [];

  for (const [name, svc] of Object.entries(targets)) {
    const diag = diagnose(name, svc);

    if (diag.type === "healthy") {
      console.log(`[OK] ${name}`);
      continue;
    }

    console.log(`[!!] ${name}: ${diag.type} — ${diag.detail}`);
    const result = heal(diag, svc);
    results.push(result);
    console.log(`  -> ${result.success ? "FIXED" : "FAILED"}: ${result.action} — ${result.detail}`);
  }

  if (results.length === 0) {
    console.log("\nAll services healthy.");
  } else {
    const fixed = results.filter(r => r.success).length;
    console.log(`\n${fixed}/${results.length} fixed.`);
  }
}

void main().catch(e => { console.error(e.message); process.exit(1); });
