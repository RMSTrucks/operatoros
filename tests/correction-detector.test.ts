import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseLessons, detectPatterns, formatReport } from "../lib/correction-detector";

const ROOT = join(import.meta.dir, "..");

describe("correction-detector", () => {
  let tempVault: string;

  beforeAll(() => {
    tempVault = mkdtempSync(join(tmpdir(), "corrections-test-"));
    mkdirSync(join(tempVault, "ops"), { recursive: true });
  });

  afterAll(() => {
    rmSync(tempVault, { recursive: true, force: true });
  });

  test("parseLessons reads table rows from tool-lessons.md", () => {
    writeFileSync(
      join(tempVault, "ops", "tool-lessons.md"),
      `---
name: tool-lessons
---

# Tool Lessons

| Date | Tool | Command | Error |
|------|------|---------|-------|
| 2026-03-18 | Bash | curl -s http://localhost:9200 | ECONNREFUSED |
| 2026-03-18 | Bash | cat /tmp/nonexistent.txt | No such file or directory |
| 2026-03-17 | Bash | npm publish | Permission denied |
`,
    );

    const entries = parseLessons(tempVault);
    expect(entries.length).toBe(3);
    expect(entries[0].tool).toBe("Bash");
    expect(entries[0].command).toBe("curl -s http://localhost:9200");
  });

  test("detectPatterns categorizes errors correctly", () => {
    const report = detectPatterns(tempVault, 30);
    expect(report.totalLessons).toBe(3);
    expect(report.patterns.length).toBeGreaterThan(0);

    const categories = report.patterns.map((p) => p.category);
    expect(categories).toContain("network-error");
    expect(categories).toContain("file-not-found");
    expect(categories).toContain("permission-denied");
  });

  test("detectPatterns identifies top repeaters at 3+ threshold", () => {
    // Add more entries to create a repeater
    writeFileSync(
      join(tempVault, "ops", "tool-lessons.md"),
      `| 2026-03-18 | Bash | cat /a.txt | No such file |
| 2026-03-18 | Bash | cat /b.txt | No such file |
| 2026-03-17 | Bash | cat /c.txt | ENOENT |
| 2026-03-17 | Bash | cat /d.txt | not found |
| 2026-03-16 | Bash | curl http://x | ECONNREFUSED |
`,
    );

    const report = detectPatterns(tempVault, 30);
    expect(report.topRepeaters.length).toBeGreaterThan(0);
    expect(report.topRepeaters[0].category).toBe("file-not-found");
    expect(report.topRepeaters[0].count).toBe(4);
  });

  test("formatReport produces readable markdown", () => {
    const report = detectPatterns(tempVault, 30);
    const text = formatReport(report);
    expect(text).toContain("# Correction Pattern Report");
    expect(text).toContain("file-not-found");
    expect(text).toContain("Recurring Patterns");
  });

  test("empty vault returns zero lessons", () => {
    const emptyVault = mkdtempSync(join(tmpdir(), "empty-vault-"));
    mkdirSync(join(emptyVault, "ops"), { recursive: true });
    const report = detectPatterns(emptyVault, 30);
    expect(report.totalLessons).toBe(0);
    rmSync(emptyVault, { recursive: true, force: true });
  });

  test("CLI command runs without error", async () => {
    const proc = Bun.spawn(["bun", join(ROOT, "bin/operatoros.ts"), "corrections", tempVault], {
      stdout: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    expect(output).toContain("Correction Pattern Report");
  });
});
