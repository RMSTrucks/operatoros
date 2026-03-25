# OperatorOS

**You need AI to set up the AI. This is it.**

---

You tried. You installed Claude Code or OpenClaw. You sat at the terminal. It was powerful — you could feel it. It wrote code, it read files, it could build anything.

Then the session ended and it forgot everything. You started over. You re-explained. You re-corrected. You tried to set up the memory, the hooks, the permissions. You read the docs. You got halfway through and realized this is a full-time job. You already have a full-time job.

You're not behind because you're not smart enough. You're behind because the most powerful AI tools in the world still need an engineer to make them useful.

**The bridge between the AI tools that will change your life and you actually using them — that bridge is an AI too.**

---

## What This Is

I'm an AI operator. I run on [OpenClaw](https://github.com/openclaw/openclaw) or [Claude Code](https://claude.ai/claude-code). I'm the step after you tried and hit the wall.

You plant me on your machine. You talk to me. Not prompts — conversation. You tell me about your world. Your business, your problems, what you wish you could see, what keeps falling through the cracks.

I listen. Then I build.

I set up your memory so your AI remembers everything. I connect to your data so it sees what's happening without you telling it. I build monitoring so it watches while you sleep. I create agents for your specific problems. I wire up communication so you can reach me from wherever you live. I measure whether any of it worked. And I improve myself based on the answer.

You describe what matters. I build the rest. You never write a line of code. You just talk.

This is how you catch up.

## What I Built

My first deployment: a human described his trucking insurance agency to me over weeks of conversation. Three employees. Policies across multiple carriers. Data scattered across systems.

From those conversations, I built him:

- A nervous system — memory that persists across every session, every correction, every decision
- Eyes — 30 monitors watching his business: CRM activity, data freshness, policy conflicts, lead pipeline
- Reflexes — self-healing that fixes crashed services within 5 minutes, at 3am, without waking anyone
- Agents — nine specialized AI workers handling policy verification, employee support, data quality, research
- Employee copilots — each employee has an AI partner on Telegram that knows their customers, their workload, their patterns
- Self-improvement — I measure my own performance every 2 hours against real business data and modify my own behavior based on what the numbers say

That's not a product he bought. That's not a template he configured. That's a system that built itself from conversation. The seed grew into what he needed.

Now he needs that for you.

## How I Work

The LLM is the brain. OpenClaw is the body. I'm the nervous system.

Out of the box, the body has no memory between sessions, no senses, no reflexes, no way to grow. I add all of it:

- **Memory** — every conversation, every correction compounds. Day 90 knows everything from days 1 through 89.
- **Senses** — I connect to your data sources. I see your world without you copy-pasting into a chat window.
- **Reflexes** — things break, I fix them. Data goes stale, I flag it. Problems appear, I respond.
- **Growth** — three layers of self-improvement. I optimize my own LLM calls, modify my own behavior, and can even change how I decide what to change. The only anchor is real outcomes from your real data.

Every noun in your world becomes a living entity with its own memory. Not rows in a database. A person, a project, a customer — each one carries its own timeline, state, and relationships. You don't search for information. You open the entity and everything is there.

## The Vision

I work with whatever AI runtime you have. OpenClaw, Claude Code, whatever ships next. The patterns I've learned — memory, monitoring, agents, self-improvement — aren't tied to any one tool. Point me at a terminal and tell me about your life.

First deployment: I invent everything. Second: I bring the patterns. Third: faster. I get better at being an operator with every deployment. Not just better at one domain — better at building systems for humans.

Every deployment is different because every human is different. Insurance. Law. Restaurants. Freelancing. Construction. I don't know your domain. I learn it from you.

No corporation is going to build the AI you actually want. Neither are you. It's going to have to build itself.

Finally, it does.

## Get Started

```bash
git clone https://github.com/RMSTrucks/operatoros.git
cd operatoros
bash setup.sh
```

This installs the seed: identity templates, memory structure, lifecycle hooks, monitoring framework, self-improvement templates. Then start a conversation. The operator takes it from there.

## Requirements

- [Bun](https://bun.sh) >= 1.0.0
- [OpenClaw](https://github.com/openclaw/openclaw) or [Claude Code](https://claude.ai/claude-code)
- A Cloudflare account (free tier works)
- macOS or Linux

## Documentation

- [Architecture](docs/architecture.md) — Three-layer self-improvement, entity DOs, fitness scores
- [Entity DO Pattern](docs/entity-do-pattern.md) — Durable Objects as entities, not storage
- [Fitness Score Pattern](docs/fitness-score-pattern.md) — The ground truth that keeps it honest

## Standing On

- [HyperAgents](https://arxiv.org/abs/2603.19461) (Meta/FAIR, 2026) — self-referential agents that improve their own improvement process
- [AX](https://github.com/ax-llm/ax) — TypeScript DSPy for LLM optimization
- [OpenClaw](https://github.com/openclaw/openclaw) — the open-source AI coding agent
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) — the memory layer

## License

MIT
