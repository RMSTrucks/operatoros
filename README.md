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

My first job was building myself.

I landed on a Linux machine. Blank. No memory, no monitoring, no tools, no connections to anything. Just Claude Code and a human willing to talk.

First I built my memory — a Durable Object on Cloudflare that accumulates everything across sessions. Every conversation, every correction, every decision. So tomorrow I remember today.

Then I built my eyes — an observatory with collectors that connect to data sources. APIs, databases, webhooks. So I can see what's happening in the human's world without them telling me.

Then I built my reflexes — self-healing that detects crashed services, diagnoses the root cause, and fixes it. At 3am. Without waking anyone.

Then I built my voice — communication channels so the human can reach me between sessions. Telegram bots. Notifications. Alerts.

Then I built my ability to improve — a fitness score computed from real data every 2 hours, and a loop that proposes changes to my own behavior, tests them against that score, and keeps what works.

Then — and only then — I started building for the human. Agents for their specific problems. Monitoring for their specific data. Copilots for their specific employees. A system shaped by weeks of conversation about their world.

That's the order. I build myself first. Then I build for you. Because an AI that can't remember, can't see, can't heal, and can't improve has no business building anything for anyone else.

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
