/**
 * System Health Collector — monitors CPU, memory, disk, and load average.
 *
 * Works on Linux and macOS. Uses /proc on Linux, sysctl/vm_stat on macOS.
 * No external dependencies — pure shell commands.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { m } from "../common";
import type { CollectorResult } from "../types";

const SOURCE = "system_health";

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function getCpuUsage(): number {
  // Linux: read /proc/stat
  if (existsSync("/proc/stat")) {
    const stat = readFileSync("/proc/stat", "utf-8");
    const line = stat.split("\n")[0]; // "cpu  user nice system idle ..."
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);
    // This is cumulative — for a point-in-time estimate, use uptime load
    const busy = total - idle;
    return total > 0 ? Math.round((busy / total) * 100 * 10) / 10 : 0;
  }
  // macOS fallback
  const top = exec("top -l 1 -n 0 | grep 'CPU usage'");
  const match = top.match(/([\d.]+)% idle/);
  return match ? Math.round((100 - parseFloat(match[1])) * 10) / 10 : 0;
}

function getMemoryUsage(): { total_mb: number; used_mb: number; pct: number } {
  if (existsSync("/proc/meminfo")) {
    const info = readFileSync("/proc/meminfo", "utf-8");
    const get = (key: string): number => {
      const m = info.match(new RegExp(`${key}:\\s+(\\d+)`));
      return m ? parseInt(m[1]) / 1024 : 0; // kB -> MB
    };
    const total = get("MemTotal");
    const available = get("MemAvailable");
    const used = total - available;
    return {
      total_mb: Math.round(total),
      used_mb: Math.round(used),
      pct: total > 0 ? Math.round((used / total) * 100 * 10) / 10 : 0,
    };
  }
  // macOS fallback
  const total = parseInt(exec("sysctl -n hw.memsize")) / (1024 * 1024);
  const pageSize = parseInt(exec("sysctl -n hw.pagesize"));
  const vmStat = exec("vm_stat");
  const pages = (key: string): number => {
    const m = vmStat.match(new RegExp(`${key}:\\s+(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const free = (pages("Pages free") + pages("Pages speculative")) * pageSize / (1024 * 1024);
  const used = total - free;
  return {
    total_mb: Math.round(total),
    used_mb: Math.round(used),
    pct: total > 0 ? Math.round((used / total) * 100 * 10) / 10 : 0,
  };
}

function getDiskUsage(): { total_gb: number; used_gb: number; pct: number } {
  const df = exec("df -BG / 2>/dev/null || df -g /");
  const lines = df.split("\n").filter((l) => l.includes("/"));
  if (lines.length === 0) return { total_gb: 0, used_gb: 0, pct: 0 };

  const parts = lines[0].split(/\s+/);
  const total = parseInt(parts[1]) || 0;
  const used = parseInt(parts[2]) || 0;
  const pct = total > 0 ? Math.round((used / total) * 100 * 10) / 10 : 0;
  return { total_gb: total, used_gb: used, pct };
}

function getLoadAverage(): { avg_1m: number; avg_5m: number; avg_15m: number } {
  if (existsSync("/proc/loadavg")) {
    const parts = readFileSync("/proc/loadavg", "utf-8").split(/\s+/);
    return {
      avg_1m: parseFloat(parts[0]) || 0,
      avg_5m: parseFloat(parts[1]) || 0,
      avg_15m: parseFloat(parts[2]) || 0,
    };
  }
  const uptime = exec("uptime");
  const match = uptime.match(/([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*$/);
  return match
    ? { avg_1m: parseFloat(match[1]), avg_5m: parseFloat(match[2]), avg_15m: parseFloat(match[3]) }
    : { avg_1m: 0, avg_5m: 0, avg_15m: 0 };
}

export async function collect(): Promise<CollectorResult> {
  const cpu = getCpuUsage();
  const mem = getMemoryUsage();
  const disk = getDiskUsage();
  const load = getLoadAverage();
  const uptimeSeconds = parseFloat(exec("cat /proc/uptime 2>/dev/null || sysctl -n kern.boottime").split(/\s/)[0]) || 0;

  const metrics = [
    m(SOURCE, "cpu_usage_pct", cpu),
    m(SOURCE, "memory_usage_pct", mem.pct),
    m(SOURCE, "memory_used_mb", mem.used_mb),
    m(SOURCE, "memory_total_mb", mem.total_mb),
    m(SOURCE, "disk_usage_pct", disk.pct),
    m(SOURCE, "disk_used_gb", disk.used_gb),
    m(SOURCE, "disk_total_gb", disk.total_gb),
    m(SOURCE, "load_avg_1m", load.avg_1m),
    m(SOURCE, "load_avg_5m", load.avg_5m),
    m(SOURCE, "load_avg_15m", load.avg_15m),
    m(SOURCE, "uptime_seconds", uptimeSeconds),
  ];

  const snapshot = {
    collected_at: new Date().toISOString(),
    cpu_pct: cpu,
    memory: mem,
    disk,
    load,
    uptime_seconds: uptimeSeconds,
    summary: `CPU ${cpu}% | RAM ${mem.pct}% (${mem.used_mb}/${mem.total_mb}MB) | Disk ${disk.pct}% | Load ${load.avg_1m}`,
  };

  return { source: SOURCE, metrics, snapshot };
}
