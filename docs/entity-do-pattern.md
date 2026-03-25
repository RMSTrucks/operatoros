# Entity Durable Object Pattern

## The Idea

A Durable Object is not storage. It's an entity -- a noun in your world.

A person, a policy, a project, an agent. Each one has its own timeline,
its own state, its own relationships, and can wake itself up on a schedule.

You don't query a database for "what's happening with Kory."
You open Kory's DO and everything about Kory is there.

## Why Not a Database?

A database is a filing cabinet. You put things in, you query to get things out.
You're always standing outside the cabinet looking in.

An entity DO is different. You're inside the thing. Everything is organized
from the entity's perspective. No JOINs because there's nothing to join.
It's all already together because it's all one thing.

A database is organized around data structure.
A DO is organized around meaning.

## The Universal Entity Interface

One DO class serves all entity types. The entity_id convention determines the type:

```
employee:cynthia-saiz    -- a person
policy:984616962         -- a policy
operator:system          -- the operator itself
thread:data              -- an infrastructure thread
customer:acme-trucking   -- a customer
agent:ceo                -- an agent
```

Each entity has:

### Timeline (append-only events)
```json
{"action": "add_event", "entity_id": "employee:cynthia-saiz",
 "event_type": "crm_call", "summary": "Called about renewal",
 "timestamp": "2026-03-25T10:30:00Z", "source_agent": "webhook"}
```

### State (namespaced key-value)
```json
{"action": "set_state", "entity_id": "employee:cynthia-saiz",
 "key": "pref:communication", "value": "prefers text over email"}
```

### Links (cross-entity relationships)
```json
{"action": "add_link", "entity_id": "employee:cynthia-saiz",
 "target_entity": "policy:984616962", "link_type": "manages"}
```

### Alarms (proactive behavior)
```json
{"action": "set_alarm", "entity_id": "employee:cynthia-saiz",
 "alarm_type": "morning_pulse", "cron": "0 8 * * 1-5"}
```

## Why This Matters for Agents

Agents think in terms of things, not tables.

When the CEO agent needs to decide who should handle a renewal:
1. Open employee:cynthia -- read her workload, recent activity, strengths
2. Open employee:tyler -- read his workload, recent activity, strengths
3. Compare. Decide. Assign.

The same way a human manager would think about it.

When a copilot needs to help an employee:
1. Open their DO -- see their recent calls, patterns, coaching notes
2. Surface what's relevant to what they're doing right now

The data is already organized around the person. No assembly required.

## Cost

Durable Objects at rest cost nothing. Reads are $0.001 per million.
Writes are $1.00 per million rows. For an agent system doing thousands
of reads and hundreds of writes per day, the cost is negligible.

Each entity manages itself, stores itself, and can wake itself up.
No database to provision. No schema migrations. No connection pools.

## Implementation

The Entity DO is a Cloudflare Durable Object with SQLite storage.
One DO class registered in wrangler.toml handles all entity types.
The entity_id in the URL determines which instance handles the request.

The DO exposes actions via a POST /call endpoint:
```
POST https://your-worker.workers.dev/call
{"tool": "entity", "params": {"action": "timeline", "entity_id": "employee:cynthia-saiz", "limit": 20}}
```

Full action list: get_profile, update, add_event, timeline, search, count,
summarize, start_pulse, stop_pulse, clear_events, set_state, get_state,
delete_state, set_alarm, get_alarm, list, seed, add_link, remove_link,
get_links, batch_event
