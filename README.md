# OperatorOS

**Your AI partner, compounding.**

OperatorOS turns Claude Code from a stateless coding assistant into a persistent AI partner that remembers who you are, learns from its mistakes, and gets better every session.

## What This Is

A set of markdown templates, shell hooks, and a setup script that gives Claude Code:

- **Memory** -- A structured vault where knowledge accumulates across sessions
- **Identity** -- CLAUDE.md templates that tell Claude who you are and how to operate
- **Self-correction** -- Hooks that capture failures and prevent repeated mistakes
- **Continuity** -- Session handoffs so every conversation picks up where the last one left off

This is not a framework. It's not a platform. It's a configuration -- markdown files and shell scripts that make Claude Code dramatically more useful by giving it context.

## The Problem

Every Claude Code session starts fresh. Claude doesn't know:
- Who you are or what you care about
- What happened in your last session
- What mistakes it made before
- What systems you run or how they work

You end up re-explaining the same things. Claude makes the same mistakes. Nothing compounds.

## The Solution

OperatorOS creates a persistent context layer:

```
~/.claude/CLAUDE.md          -- Your universal principles (loads every session)
~/CLAUDE.md                  -- Your project context (loads in this directory)
~/.claude/hooks/             -- Auto-capture failures, inject context, handoff sessions
~/.claude/.../memory/        -- Three-space vault (self, ops, notes)
```

After one week of use, Claude knows you. After one month, it's a genuine partner.

## Quick Start

```bash
git clone https://github.com/RMSTrucks/operatoros.git
cd operatoros
bash setup.sh
```

The setup script will:
1. Ask your name
2. Create a memory vault with templates
3. Install session hooks
4. Set up CLAUDE.md templates

Then open Claude Code and start working. The hooks handle the rest.

## How It Works

### The Memory Vault

Three spaces, each serving a different purpose:

```
memory/
  self/              -- Who you are (identity, capabilities, methodology, principal)
  ops/               -- Live state (session handoff, active threads, known issues, tool lessons)
  notes/             -- Knowledge graph (organized by Maps of Content)
    mocs/            -- Navigation hubs for topic areas
```

**Progressive disclosure**: MEMORY.md links to sections, sections link to files. Claude loads what it needs, not everything.

### The Hook Flywheel

Four hooks create a self-correcting loop:

1. **session-start.sh** -- Injects vault context (handoff, active threads, known issues, hard rules)
2. **session-end.sh** -- Auto-generates handoff if the AI forgot to update it
3. **capture-lessons.sh** -- Records Bash failures to tool-lessons.md automatically
4. **detect-iteration.sh** -- Warns when running the same command 3+ times (sign of being stuck)

The flywheel: mistakes become lessons, lessons become context, context prevents repeating mistakes.

### The CLAUDE.md Chain

Layered identity that gets more specific at each level:

| Level | File | Contains |
|-------|------|----------|
| Global | `~/.claude/CLAUDE.md` | Universal principles, preferences, hard rules |
| Project | `~/CLAUDE.md` | Services, APIs, debugging trees, operational context |
| Repository | `~/repo/CLAUDE.md` | Code conventions, build commands, deploy procedures |

Each layer inherits everything above it. See `templates/claude-md/layering-guide.md` for details.

## After Setup

1. **Edit `self/identity.md`** -- Tell Claude who it is in your partnership
2. **Edit `self/principal.md`** -- Describe yourself, your preferences, your frustrations
3. **Edit `~/.claude/CLAUDE.md`** -- Add your principles and hard rules
4. **Start working** -- The hooks capture context automatically
5. **Correct Claude when it's wrong** -- Corrections compound in the vault

## Philosophy

OperatorOS is built on six ideas:

1. **Configuration over code** -- The intelligence comes from Claude. We give it better context.
2. **Local-first** -- Your data stays on your machine. Nothing phones home.
3. **Compound over time** -- Every session should leave something behind.
4. **Error correction over perfection** -- Expect mistakes. Make them cheap to fix.
5. **Progressive disclosure** -- Load what you need, not everything.
6. **The human is the principal** -- AI operates, human directs.

## What This Is NOT

- Not an IDE (Cursor and Windsurf do that)
- Not a chatbot UI (use Claude.ai for that)
- Not a cloud service (everything is local files)
- Not a general-purpose AI framework (this is specifically for human-AI partnerships via Claude Code)

## Project Structure

```
operatoros/
  setup.sh                            -- Run this first
  templates/
    vault/                            -- Memory vault templates
      MEMORY.md                       -- Index template
      self/                           -- Identity templates
      ops/                            -- Operational state templates
      notes/mocs/                     -- Knowledge organization
    hooks/                            -- Shell hooks
      session-start.sh                -- Context injection
      session-end.sh                  -- Auto handoff
      capture-lessons.sh              -- Failure capture
      detect-iteration.sh             -- Stuck detection
      settings-snippet.json           -- Hook configuration for settings.json
    claude-md/                        -- CLAUDE.md templates
      global-claude-md.md             -- Global identity template
      project-claude-md.md            -- Project context template
      layering-guide.md               -- How the layers work
```

## License

MIT

## Origin

Built by extracting patterns from a production AI operator system running a real business. The patterns were discovered by doing, not designed by committee.
