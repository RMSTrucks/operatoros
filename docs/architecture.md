# OperatorOS Architecture

## The Von Neumann Operator

The operator is a seed. It lands on a machine, builds what it needs, talks to the human, and creates self-improving agents to solve their problems.

It doesn't carry the solution. It carries the ability to build solutions.

## Three-Layer Self-Improvement

```
Layer 1 (AX/DSPy)     -- Optimizes individual LLM calls
    feeds into
Layer 2 (Hyperagent)   -- Optimizes agent behavior via self-modifications
    feeds into
Layer 3 (Self-ref)     -- Meta-strategy and eval-criteria are editable
    grounded by
Fitness Score          -- External, from real data, can't be gamed
```

### Layer 1: LLM Call Optimization
Uses AX (TypeScript DSPy) for typed signatures with automatic few-shot optimization.
Each LLM call in the system is a signature: input types -> output types, scored by a metric.
BootstrapFewShot selects the best examples from the archive to include in prompts.
Training data comes from the system's own outcome history.

### Layer 2: Hyperagent Behavior Optimization
Three editable files (the "program"):
1. **operator-modifications.md** -- self-written rules, priorities, behaviors
2. **operator-meta-strategy.md** -- how the operator decides what to modify
3. **operator-eval-criteria.md** -- how the operator judges whether changes worked

The loop: propose modification -> apply -> wait for fitness measurements -> evaluate -> keep or revert.

### Layer 3: Self-Referential
The meta-strategy and eval-criteria are themselves editable by the hyperagent.
The operator can change how it decides what to change and how it judges changes.
The only anchor is the fitness score -- external, computed from real data.

## Entity Durable Objects

Every noun in the human's world is a Cloudflare Durable Object.

Not rows in a database. Entities with:
- **Timeline** -- append-only event log with original timestamps
- **State** -- namespaced key-value pairs (pref:, pattern:, etc.)
- **Links** -- cross-entity relationships (employee -> policies, customer -> agents)
- **Alarms** -- proactive behaviors (scheduled notifications, self-wakeup)

The DO isn't storage. It's the thing itself. You don't query for data about a person.
You open their DO and everything about them is there.

### Why DOs, Not a Database

A database organizes data around structure (tables, columns, joins).
A DO organizes data around meaning (this person, this policy, this agent).

Agents think in terms of things, not tables. When the CEO agent needs to decide
who should handle a renewal, it opens each employee's DO and reads their workload.
The same way a human manager would think about it.

## Fitness Score

One composite number computed from things the system controls. The ground truth
for all self-improvement. Components vary by deployment:

**For a system operator:**
- Data accuracy, system uptime, data freshness, knowledge growth, autonomy

**For a business agent:**
- Business output metrics (quotes, sales, retention)
- Human experience metrics (engagement, trust signals, response time)

The fitness score is the one thing no layer can edit. It's computed from external
data by code. The agent can rewrite everything about itself except the test.

## Bootstrap Sequence

1. Listen -- understand the human's world
2. Communication -- persistent channel between sessions
3. Memory -- operator Entity DO for continuity
4. Eyes -- connect to the human's data sources
5. Monitoring -- observatory with initial collectors
6. Hooks -- session lifecycle (start injects, stop captures)
7. First agent -- solve the biggest pain point
8. Fitness score -- define and compute the ground truth
9. Self-improvement -- the hyperagent loop

## The Hierarchy

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
    |
IC agents (hyperagents)
  optimize specific work
```

Each layer is a hyperagent. Each can modify itself. Each is grounded by the layer above.
The whole thing is grounded by reality -- the bank account, the metrics, whether the
human had to intervene.

## Connection to DSPy/AX

This architecture is DSPy at a higher layer of abstraction:

- **DSPy:** Optimizes a single LLM call (prompt engineering)
- **Hyperagent:** Optimizes agent behavior across sessions (configuration engineering)
- **Self-referential:** Optimizes the optimization process itself

They stack. AX operates inside the hyperagent to make each LLM call better.
The hyperagent operates across sessions to make the agent better.
The self-referential part operates across improvement cycles to make improvement better.
