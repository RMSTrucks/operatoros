#!/usr/bin/env bun
/**
 * OperatorOS CLI — unified entry point for all OperatorOS operations.
 *
 * Usage:
 *   operatoros init              — Set up vault, hooks, and CLAUDE.md templates
 *   operatoros init --guided     — Interactive identity setup
 *   operatoros observatory       — Start the observatory server
 *   operatoros scan              — Run a one-shot observatory scan
 *   operatoros report            — Generate a morning report
 *   operatoros status            — Quick system health check
 *   operatoros corrections       — Detect recurring mistake patterns
 *   operatoros version           — Show version
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { $ } from "bun";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const VERSION = "0.5.0";

const command = process.argv[2];
const args = process.argv.slice(3);

function usage(): void {
  console.log(`OperatorOS v${VERSION} — Your AI partner, compounding.

Usage:
  operatoros init [--guided]   Set up vault, hooks, and CLAUDE.md templates
  operatoros observatory       Start the observatory server
  operatoros scan              Run a one-shot observatory scan
  operatoros report            Generate a morning report
  operatoros status            Quick system health check
  operatoros corrections [dir] Detect recurring mistake patterns
  operatoros version           Show version
  operatoros help              Show this help`);
}

async function init(): Promise<void> {
  const setupScript = resolve(ROOT, "setup.sh");
  if (!existsSync(setupScript)) {
    console.error("Error: setup.sh not found at", setupScript);
    process.exit(1);
  }

  const proc = Bun.spawn(["bash", setupScript, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

async function observatory(): Promise<void> {
  const serverPath = resolve(ROOT, "templates/observatory/server.ts");
  if (!existsSync(serverPath)) {
    console.error("Error: observatory server not found at", serverPath);
    process.exit(1);
  }

  const proc = Bun.spawn(["bun", serverPath, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  await proc.exited;
}

async function scan(): Promise<void> {
  const scannerPath = resolve(ROOT, "templates/observatory/scanner.ts");
  if (!existsSync(scannerPath)) {
    console.error("Error: scanner not found at", scannerPath);
    process.exit(1);
  }

  const proc = Bun.spawn(["bun", scannerPath, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

async function report(): Promise<void> {
  const reportPath = resolve(ROOT, "templates/reports/morning-report.ts");
  if (!existsSync(reportPath)) {
    console.error("Error: morning report not found at", reportPath);
    process.exit(1);
  }

  const proc = Bun.spawn(["bun", reportPath, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

async function status(): Promise<void> {
  const port = process.env.OBSERVATORY_PORT || "9201";
  const url = `http://localhost:${port}/`;

  try {
    const resp = await fetch(url);
    const data = (await resp.json()) as Record<string, unknown>;
    console.log("Observatory status:");
    for (const [key, value] of Object.entries(data)) {
      if (key === "db") continue; // skip internal path
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      console.log(`  ${label.padEnd(20)} ${value}`);
    }
  } catch {
    console.log(`Observatory not running (tried ${url})`);
    console.log("Start it with: operatoros observatory");
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

switch (command) {
  case "init":
    await init();
    break;
  case "observatory":
    await observatory();
    break;
  case "scan":
    await scan();
    break;
  case "report":
    await report();
    break;
  case "status":
    await status();
    break;
  case "corrections": {
    const { detectPatterns, formatReport } = await import("../lib/correction-detector");
    const vaultDir = args[0] ?? `${process.env.HOME ?? ""}/.claude/projects/-home-${(process.env.USER ?? "user").replace(/\//g, "-")}/memory`;
    const days = parseInt(args[1] ?? "30", 10);
    const report = detectPatterns(vaultDir, days);
    console.log(formatReport(report));
    break;
  }
  case "version":
  case "--version":
  case "-v":
    console.log(`OperatorOS v${VERSION}`);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    usage();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
}
