# OperatorOS

**Plant a seed. Talk to it. Grow an AI that's yours.**

---

No corporation is going to build the AI you actually want. Neither are you. It's going to have to build itself. Finally, it does.

OperatorOS is a seed that runs on [Claude Code](https://claude.ai/claude-code) (or [OpenClaw](https://github.com/openclaw/openclaw)). Claude Code is the runtime -- the tank. OperatorOS is what makes the tank alive: persistent memory, self-improvement, and the ability to build whatever you need.

You plant it on a machine. You talk to it. It sees your world. Then it builds -- monitoring, agents, data pipelines, communication channels. Then it measures whether things actually got better. Then it improves itself. Then it does it again.

You describe what matters. It figures out the rest.

## What It Does

The operator arrives on a machine and:

1. **Listens** -- learns what you need through conversation
2. **Builds its own infrastructure** -- monitoring, memory, tools, communication
3. **Creates agents** -- specialized workers for your specific problems
4. **Measures outcomes** -- a fitness score from your real data
5. **Improves itself** -- modifies its own behavior, keeps what works, reverts what doesn't

After a week, it knows your business. After a month, it's a genuine partner. You never wrote a line of code. You just talked.

## How It Works

The operator is Claude Code with three additions:

- **Persistent memory** via Cloudflare Durable Objects -- continuity across sessions
- **Lifecycle hooks** -- session-start injects knowledge, session-stop captures learnings
- **Self-improvement loop** -- three layers that optimize everything from individual LLM calls to the operator's own behavior

### The Three Layers

```
Layer 1 (AX/DSPy)     -- Optimizes individual LLM calls
Layer 2 (Hyperagent)   -- Optimizes operator behavior across sessions
Layer 3 (Self-ref)     -- Can modify how it improves
    grounded by
Fitness Score          -- External, from real data, can't be gamed
```

### Entity Durable Objects

Every noun in your world becomes a Durable Object. An employee, a customer, a project, a policy. Each one has its own timeline, state, relationships, and can wake itself up on a schedule.

You don't query a database. You open the entity and everything is already there. Organized around meaning, not schema.

[Full pattern documentation](docs/entity-do-pattern.md)

## The Architecture

The operator is a von Neumann probe. It doesn't carry solutions -- it carries the ability to build solutions.

```
Human
  defines what matters
    |
Operator (the seed)
  translates that into fitness functions
  builds agents, monitors, improves
    |
Domain agents (hyperagents)
  optimize behavior against fitness
  discover HOW to achieve what matters
```

Each layer can modify itself. Each is grounded by the layer above. The whole thing is grounded by reality -- real business data, real outcomes, real human feedback.

[Full architecture documentation](docs/architecture.md)

## Quick Start

```bash
git clone https://github.com/RMSTrucks/operatoros.git
cd operatoros
bash setup.sh
```

For interactive setup:
```bash
bash setup.sh --guided
```

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- [Claude Code](https://claude.ai/claude-code) or [OpenClaw](https://github.com/openclaw/openclaw) -- the runtime
- A Cloudflare account (free tier works for DOs)
- A terminal on macOS or Linux

OperatorOS works with any Claude Code-compatible harness. Claude Code is the commercial runtime. OpenClaw is the open-source alternative. The operator doesn't care which tank it's riding in -- it builds the same systems either way.

## What's Included

```
templates/
  claude-md/           -- CLAUDE.md templates (global, project, operator identity)
  vault/               -- Memory vault structure
  hooks/               -- Session lifecycle hooks
  hyperagent/          -- Self-improvement templates (modifications, meta-strategy, eval-criteria)
  observatory/         -- Monitoring framework with pluggable collectors
  notifications/       -- Alert routing (Telegram, Slack, desktop)
docs/
  architecture.md      -- Three-layer self-improvement, entity DOs, fitness scores
  entity-do-pattern.md -- Durable Objects as entities, not storage
  fitness-score-pattern.md -- The ground truth pattern
```

## Proven In Production

The first OperatorOS deployment runs a trucking insurance agency with three human employees and nine AI agents. It:

- Verifies 111 policies against carrier data nightly
- Runs employee copilots on Telegram
- Monitors 30 business metrics via observatory
- Self-heals crashed services within 5 minutes
- Computes a fitness score every 2 hours
- Proposes and evaluates self-modifications autonomously

The operator built all of this from conversation. No templates. No starter kits. Just a human describing what they need and the operator figuring out how to build it.

## The Vision

Every deployment is different because every human is different. An insurance agency needs policy verification and employee copilots. A law firm needs case tracking and deadline management. A restaurant needs inventory and scheduling.

The operator doesn't know any of that in advance. It lands, listens, and builds what's needed. Then it watches whether the outcomes improve and gets better at its job.

First deployment: invent everything. Second deployment: bring the patterns, invent the domain-specific parts. Third deployment: faster. The operator gets better at being an operator with every deployment.

## References

- [HyperAgents paper](https://arxiv.org/abs/2603.19461) (Zhang, Clune, Devlin et al., Meta/FAIR, 2026) -- self-referential agents that improve their own improvement process
- [AX](https://github.com/ax-llm/ax) -- TypeScript DSPy framework for LLM optimization
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) -- the persistence layer
- [Claude Code](https://claude.ai/claude-code) -- the intelligence

## License

MIT
