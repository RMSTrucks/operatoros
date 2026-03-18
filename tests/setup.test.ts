import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "..");

describe("setup.sh", () => {
  let tempHome: string;

  beforeAll(() => {
    tempHome = mkdtempSync(join(tmpdir(), "operatoros-test-"));
  });

  afterAll(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  test("creates vault directory structure", async () => {
    // Run setup.sh with --name and --vault-dir to avoid interactive prompts
    const vaultDir = join(tempHome, ".claude/projects/-test/memory");
    const claudeDir = join(tempHome, ".claude");

    const proc = Bun.spawn(
      ["bash", join(ROOT, "setup.sh"), "--name", "TestUser", "--vault-dir", vaultDir],
      {
        env: { ...process.env, HOME: tempHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    await proc.exited;

    // Vault directories created
    expect(existsSync(join(vaultDir, "self"))).toBe(true);
    expect(existsSync(join(vaultDir, "ops"))).toBe(true);
    expect(existsSync(join(vaultDir, "notes/mocs"))).toBe(true);

    // Core vault files created
    expect(existsSync(join(vaultDir, "MEMORY.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "self/identity.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "self/principal.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "self/methodology.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "ops/session-handoff.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "ops/active-threads.md"))).toBe(true);
  });

  test("creates hooks directory with executable scripts", async () => {
    const hooksDir = join(tempHome, ".claude/hooks");
    expect(existsSync(hooksDir)).toBe(true);

    const expectedHooks = [
      "session-start.sh",
      "session-end.sh",
      "capture-lessons.sh",
      "detect-iteration.sh",
      "precompact-save.sh",
      "sync-vault-state.sh",
    ];

    for (const hook of expectedHooks) {
      const hookPath = join(hooksDir, hook);
      expect(existsSync(hookPath)).toBe(true);
    }
  });

  test("creates CLAUDE.md templates", async () => {
    expect(existsSync(join(tempHome, ".claude/CLAUDE.md"))).toBe(true);
    expect(existsSync(join(tempHome, "CLAUDE.md"))).toBe(true);
  });

  test("creates first-conversation.md seed", async () => {
    const vaultDir = join(tempHome, ".claude/projects/-test/memory");
    const firstConvo = join(vaultDir, "../first-conversation.md");
    expect(existsSync(firstConvo)).toBe(true);

    const content = readFileSync(firstConvo, "utf-8");
    expect(content).toContain("[FIRST CONVERSATION]");
    expect(content).toContain("LISTEN");
  });

  test("replaces name placeholder in templates", async () => {
    const vaultDir = join(tempHome, ".claude/projects/-test/memory");
    const principal = readFileSync(join(vaultDir, "self/principal.md"), "utf-8");
    expect(principal).toContain("TestUser");
    expect(principal).not.toContain("[YOUR_NAME]");
  });
});

describe("templates", () => {
  test("all template files exist", () => {
    const required = [
      "templates/vault/MEMORY.md",
      "templates/vault/self/identity.md",
      "templates/vault/self/principal.md",
      "templates/vault/self/methodology.md",
      "templates/vault/ops/session-handoff.md",
      "templates/vault/ops/active-threads.md",
      "templates/vault/ops/known-issues.md",
      "templates/vault/ops/tool-lessons.md",
      "templates/hooks/session-start.sh",
      "templates/hooks/session-end.sh",
      "templates/hooks/capture-lessons.sh",
      "templates/claude-md/global-claude-md.md",
      "templates/claude-md/project-claude-md.md",
      "templates/first-conversation.md",
    ];

    for (const file of required) {
      expect(existsSync(join(ROOT, file))).toBe(true);
    }
  });

  test("vault templates are valid markdown with frontmatter", () => {
    const vaultTemplates = [
      "templates/vault/self/identity.md",
      "templates/vault/self/principal.md",
      "templates/vault/self/methodology.md",
      "templates/vault/ops/session-handoff.md",
      "templates/vault/ops/active-threads.md",
    ];

    for (const file of vaultTemplates) {
      const content = readFileSync(join(ROOT, file), "utf-8");
      expect(content.startsWith("---\n")).toBe(true);
      // Has closing frontmatter
      const secondDash = content.indexOf("---", 4);
      expect(secondDash).toBeGreaterThan(0);
    }
  });
});

describe("CLI", () => {
  test("operatoros --version prints version", async () => {
    const proc = Bun.spawn(["bun", join(ROOT, "bin/operatoros.ts"), "--version"], {
      stdout: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    expect(output.trim()).toMatch(/^OperatorOS v\d+\.\d+\.\d+$/);
  });

  test("operatoros help prints usage", async () => {
    const proc = Bun.spawn(["bun", join(ROOT, "bin/operatoros.ts"), "help"], {
      stdout: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    expect(output).toContain("operatoros init");
    expect(output).toContain("operatoros observatory");
  });

  test("operatoros unknown-command exits with error", async () => {
    const proc = Bun.spawn(["bun", join(ROOT, "bin/operatoros.ts"), "bogus"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });
});
