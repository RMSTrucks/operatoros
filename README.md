# OperatorOS

**Plant a seed. Talk to it. Grow an AI that's yours.**

---

Every AI assistant you've ever used forgets you. Every session is day one. You explain the same things, correct the same mistakes, rebuild the same context. On day 180, the AI knows exactly as much about you as it did on day one.

OperatorOS fixes this. It's a kernel — the smallest possible thing that can grow into a personal AI through conversation. You talk to it. It listens. It remembers. It gets better.

## What It Does

After installing OperatorOS, your AI:

- **Remembers who you are** — your name, your role, your preferences, your projects
- **Learns from mistakes** — failures are automatically captured so they're never repeated
- **Picks up where you left off** — every session continues from the last one, not from zero
- **Gets better over time** — corrections compound. After a week, it knows you. After a month, it's a genuine partner.

You don't configure any of this. You just talk. The system handles the rest.

## Requirements

- **[Bun](https://bun.sh)** >= 1.0.0 (runtime for CLI and hooks)
- **[Claude Code](https://claude.ai/claude-code)** (the AI that OperatorOS makes persistent)
- A terminal on macOS or Linux

## Quick Start

```bash
git clone https://github.com/RMSTrucks/operatoros.git
cd operatoros
bash setup.sh
```

For interactive setup that walks you through identity configuration:

```bash
bash setup.sh --guided
```

Then open Claude Code in your project directory and start talking. The AI will recognize it's a fresh install and begin learning who you are from the conversation itself.

## What Happens After Install

1. **setup.sh** creates a memory vault (`.claude/` directory with markdown files), installs lifecycle hooks into Claude Code's settings, and sets up CLAUDE.md identity templates.

2. **First session** — the session-start hook fires, loads vault context, and the AI introduces itself. It asks about you: your name, your role, what you're working on. Your answers become the seed of its memory.

3. **Subsequent sessions** — each session starts by loading everything the AI learned previously. Session handoffs, captured lessons, your identity, your project context. The AI picks up where it left off.

4. **Over time** — mistakes get captured automatically. Patterns emerge. The AI stops making the same errors and starts anticipating your needs. Knowledge compounds.

## How It Works

OperatorOS creates a persistent memory layer for your AI. Three things make this possible:

1. **The Vault** — A directory of markdown files where your AI stores what it learns about you. Your identity, your preferences, your projects, lessons from past mistakes. Just files — readable, portable, yours.

2. **The Hooks** — Lifecycle events that automatically capture knowledge and inject context. Session starts: the AI loads everything it knows about you. Something fails: the lesson is recorded. Session ends: a handoff is written for next time.

3. **The Identity** — A layered system that tells the AI who it is, who you are, and how to work with you. Not a persona — a functional understanding that makes the AI effective for *you specifically*.

The technical details are invisible. You just notice your AI getting smarter about your work.

## CLI Commands

```
operatoros init [--guided]   Set up vault, hooks, and CLAUDE.md templates
operatoros observatory       Start the observatory server (metric collection)
operatoros scan              Run a one-shot observatory scan
operatoros report            Generate a morning report
operatoros status            Quick system health check
operatoros corrections       Detect recurring mistake patterns
operatoros version           Show version
```

## The Vision

OperatorOS is a kernel. A seed. The smallest starting point that can grow into something deeply personal through nothing more than talking.

A senior engineer uses it to build a coding partner that knows their codebase, their conventions, and their debugging style. A business owner uses it to build an operator that knows their customers, their workflows, and their priorities. A student uses it to build a learning companion that remembers what they've studied and where they struggle.

**The right unit of AI persistence is a directory of files that you own.** Not a cloud service. Not a fine-tuned model. Not a vector database. Files on your machine that can't be taken away from you. Open source isn't our business model. It's our trust model. "Yours" means yours.

## Philosophy

1. **Talk, don't configure** — The AI should learn about you from conversation, not config files
2. **Local-first** — Your data stays on your machine. Nothing phones home
3. **Compound over time** — Every session should leave something behind
4. **Error correction over perfection** — Expect mistakes. Make them cheap to find and fix
5. **The human is the principal** — AI operates, human directs

## For Contributors

Under the hood, OperatorOS is markdown templates, shell hooks, and a TypeScript CLI for Claude Code:

```
operatoros/
  bin/operatoros.ts                       # CLI entry point
  lib/                                    # Scorecard, picker, runner, corrections
  setup.sh                               # Interactive setup
  templates/
    vault/                               # Memory vault templates
      MEMORY.md                          # Index template
      self/                              # Identity (who the AI is, who you are)
      ops/                               # Live state (handoffs, threads, lessons)
      notes/mocs/                        # Knowledge organization
    hooks/                               # Lifecycle hooks
      session-start.sh                   # Context injection
      session-end.sh                     # Auto-handoff
      capture-lessons.sh                 # Failure capture
      detect-iteration.sh               # Stuck detection
      precompact-save.sh                # Save context before compression
      sync-vault-state.sh              # Sync state from external sources
      settings-snippet.json             # Hook configuration
    claude-md/                           # CLAUDE.md identity templates
      global-claude-md.md               # Universal principles
      project-claude-md.md              # Project context
      layering-guide.md                 # How the layers work
    observatory/                         # Metric collection framework
    notifications/                       # Multi-channel alerting
    reports/                             # Morning report generator
  COMPONENTS.md                          # Component interface contracts
```

See `COMPONENTS.md` for the interface contracts if you want to build collectors, alert rules, notification channels, or vault templates.

## Origin

Built by extracting patterns from a production AI operator system running a real business — 9 companies, 33 agents, 200+ issues tracked. The patterns were discovered by doing, not designed by committee.

## License

MIT
