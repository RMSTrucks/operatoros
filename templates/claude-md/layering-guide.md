# The CLAUDE.md Layering Model

## Why Layers?

Claude Code loads CLAUDE.md files hierarchically. Each layer adds context without repeating what's above it. This means:

- **Global** (`~/.claude/CLAUDE.md`) — Who you are, universal principles, hard rules
- **Project** (`~/project/CLAUDE.md`) — Operational context for this working directory
- **Repository** (`~/repo/CLAUDE.md`) — Code conventions, build commands, API details

Each layer inherits everything above it. A project CLAUDE.md doesn't need to repeat your principles — they're already loaded from global.

## What Goes Where

| Level | Put Here | Don't Put Here |
|-------|----------|----------------|
| **Global** | Principles, preferences, hard rules, who you are | API endpoints, repo-specific commands |
| **Project** | Services, APIs, debugging trees, operational context | Universal principles (already in global) |
| **Repository** | Build commands, code conventions, deploy procedures | Business context (that's project level) |

## The Compounding Effect

When Claude starts a session, it loads:
1. Global CLAUDE.md (your identity)
2. Project CLAUDE.md (your operational context)
3. Memory vault (your accumulated knowledge)
4. Session hooks (your recent context)

After a week of use, Claude knows:
- Who you are and how you think (global)
- What systems you run and how they work (project)
- What happened recently and what's active (vault)
- What mistakes to avoid (tool-lessons, known-issues)

This is what makes OperatorOS different from vanilla Claude Code. It's not smarter — it's better informed.

## Tips

1. **Start small.** A 20-line global CLAUDE.md is better than a 200-line one you'll never update.
2. **Add when it hurts.** When Claude makes the same mistake twice, add it to CLAUDE.md.
3. **Promote patterns.** When a project-level insight applies everywhere, move it to global.
4. **Keep tokens precious.** Every line costs context window. Be concise.
