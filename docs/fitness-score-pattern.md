# Fitness Score Pattern

## The Idea

One number. Computed from real data. The ground truth for all self-improvement.

The fitness score measures things the system controls. Not things humans control.
Not things the market controls. Things the system directly influences, verified
by code against trusted data sources.

## Why One Number?

A dashboard with 30 metrics is noise. You don't know what to improve.
A single composite score tells you: am I getting better or worse?

The components tell you where to focus. The composite tells you the trend.
The hyperagent uses the composite for keep/revert decisions. The components
tell it where to propose modifications.

## Design Principles

1. **Only measure what you control.** The system can't control whether a customer
   buys. It CAN control whether data is accurate, services are running, and
   information reaches the right person at the right time.

2. **Verify from trusted sources.** Every component must be computed by code
   reading from an authoritative data source. No self-reported metrics.
   No LLM-judged quality. Code checks. Reality answers.

3. **Weight by importance.** Not all components matter equally. The weights
   are themselves a parameter the hyperagent can learn to tune over time.

4. **Store for trending.** The score gets stored every time it's computed.
   The trend matters more than any single measurement.

## Template Components

### For a system operator:
| Component | Weight | What it measures |
|-----------|--------|------------------|
| data_accuracy | 25% | Conflicts between systems (source of truth vs what we claim) |
| system_uptime | 20% | Services and bots running |
| data_freshness | 20% | How recently data was verified against sources |
| knowledge_growth | 15% | Knowledge entries, processing health |
| autonomy | 20% | How rarely the human corrects the system |

### For a business agent:
| Component | Weight | What it measures |
|-----------|--------|------------------|
| output_metrics | 30% | Business outcomes the agent influences (quotes, tasks completed) |
| human_engagement | 25% | Do the humans the agent supports use it? (pull vs push) |
| accuracy | 20% | Are the agent's outputs correct? (verified against data) |
| efficiency | 15% | Cost per outcome, time per task |
| autonomy | 10% | How often does escalation to humans occur? |

### Customize for every deployment
The components above are starting points. The human tells you what matters.
You build the score from what's measurable in their world. The hyperagent
tunes the weights over time.

## The Anchor Property

The fitness score is the ONE thing no layer of the system can edit.

Layer 1 (AX) can optimize the prompts. Layer 2 (hyperagent) can rewrite
the agent's behavior. Layer 3 (self-referential) can change how improvement
works. None of them can change the fitness score.

If the agent rewrites itself to say "I'm perfect, ignore all problems" --
the fitness score drops. That variant gets killed. Reality wins.

This is what grounds the entire self-improvement architecture.
Without it, the recursion has nothing to anchor to.
