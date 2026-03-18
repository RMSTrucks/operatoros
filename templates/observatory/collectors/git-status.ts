/**
 * Git Status Collector — monitors uncommitted work across tracked repos.
 *
 * Checks each configured repo for modified, untracked, and staged files.
 * Tracks how long changes have been sitting uncommitted.
 *
 * Configure REPOS below to match your environment.
 */

import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { m } from "../common";
import type { CollectorResult } from "../types";

const SOURCE = "git_status";
const HOME = process.env.HOME || "/home/user";

// ---------------------------------------------------------------------------
// Configure your repos here
// ---------------------------------------------------------------------------

interface RepoCheck {
  name: string;
  path: string;
}

const REPOS: RepoCheck[] = [
  // Add your repos here. Examples:
  // { name: "my-project", path: resolve(HOME, "projects/my-project") },
  // { name: "dotfiles", path: resolve(HOME, ".dotfiles") },
];

// Auto-discover: if no repos configured, scan home directory for git repos
async function getRepos(): Promise<RepoCheck[]> {
  if (REPOS.length > 0) return REPOS;

  // Fallback: check common locations
  const candidates = [
    "projects", "src", "code", "repos", "workspace", "dev",
  ].flatMap((dir) => {
    const base = resolve(HOME, dir);
    if (!existsSync(base)) return [];
    try {
      const entries = execSync(`ls -d ${base}/*/`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim().split("\n").filter(Boolean);
      return entries
        .filter((p) => existsSync(resolve(p, ".git")))
        .map((p) => ({
          name: p.split("/").filter(Boolean).pop() || "unknown",
          path: p.replace(/\/$/, ""),
        }));
    } catch {
      return [];
    }
  });

  return candidates.slice(0, 20); // cap at 20 repos
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(repoPath: string, cmd: string): string {
  try {
    return execSync(`git -C "${repoPath}" ${cmd}`, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function getStatusLines(repoPath: string): string[] {
  const output = git(repoPath, "status --porcelain");
  return output ? output.split("\n") : [];
}

function getOldestModifiedAge(repoPath: string, lines: string[]): number {
  let oldest = 0;
  const now = Date.now();
  for (const line of lines) {
    const filePath = line.slice(3).trim();
    const fullPath = resolve(repoPath, filePath);
    try {
      if (existsSync(fullPath)) {
        const ageHours = (now - statSync(fullPath).mtimeMs) / (1000 * 60 * 60);
        if (ageHours > oldest) oldest = ageHours;
      }
    } catch {}
  }
  return Math.round(oldest * 10) / 10;
}

function getLastCommitAge(repoPath: string): number {
  const timestamp = git(repoPath, "log -1 --format=%ct");
  if (!timestamp) return -1;
  return Math.round(((Date.now() / 1000 - parseInt(timestamp)) / 3600) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

export async function collect(): Promise<CollectorResult> {
  const repos = await getRepos();
  const metrics: CollectorResult["metrics"] = [];
  const snapshot: Record<string, unknown> = {
    collected_at: new Date().toISOString(),
  };

  let totalDirty = 0;
  let totalModified = 0;
  let totalUntracked = 0;
  let maxStaleHours = 0;
  const dirtyRepos: string[] = [];
  const staleRepos: string[] = [];

  for (const repo of repos) {
    if (!existsSync(resolve(repo.path, ".git"))) continue;

    const lines = getStatusLines(repo.path);
    const modified = lines.filter((l) => l.startsWith(" M") || l.startsWith("M ") || l.startsWith("MM"));
    const untracked = lines.filter((l) => l.startsWith("??"));
    const staged = lines.filter((l) => /^[MADRC]/.test(l));
    const dirtyCount = lines.length;
    const oldestAge = dirtyCount > 0 ? getOldestModifiedAge(repo.path, lines) : 0;
    const lastCommitAge = getLastCommitAge(repo.path);

    metrics.push(m(SOURCE, `dirty_files_${repo.name}`, dirtyCount));

    const repoSnapshot: Record<string, unknown> = {
      dirty_files: dirtyCount,
      modified: modified.length,
      untracked: untracked.length,
      staged: staged.length,
      oldest_change_hours: oldestAge,
      last_commit_hours_ago: lastCommitAge,
    };

    if (dirtyCount > 0) {
      totalDirty++;
      totalModified += modified.length;
      totalUntracked += untracked.length;
      dirtyRepos.push(repo.name);
      repoSnapshot.files = lines.map((l) => l.slice(3).trim()).slice(0, 20);

      if (oldestAge > maxStaleHours) maxStaleHours = oldestAge;
      if (oldestAge > 24) staleRepos.push(`${repo.name} (${oldestAge}h)`);
    }

    snapshot[repo.name] = repoSnapshot;
  }

  metrics.push(m(SOURCE, "dirty_repos_count", totalDirty));
  metrics.push(m(SOURCE, "total_modified_files", totalModified));
  metrics.push(m(SOURCE, "total_untracked_files", totalUntracked));
  metrics.push(m(SOURCE, "max_stale_hours", maxStaleHours));
  metrics.push(m(SOURCE, "repos_tracked", repos.length));

  snapshot.summary =
    totalDirty === 0
      ? `All ${repos.length} repos clean.`
      : `${totalDirty} dirty repo(s): ${dirtyRepos.join(", ")}.${
          staleRepos.length > 0 ? ` STALE (>24h): ${staleRepos.join(", ")}.` : ""
        }`;

  return { source: SOURCE, metrics, snapshot };
}
