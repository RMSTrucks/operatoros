# OperatorOS External User Test Protocol

**Version:** 1.0
**Status:** Ready for clone-path testing (npx path blocked on npm publish)

---

## Overview

The goal is to validate that someone who is NOT Jake can install OperatorOS, have it learn about them through conversation, and experience compounding knowledge across sessions.

**Test duration:** 3 sessions over 3-5 days
**Time commitment:** ~60 minutes total (20 min per session)
**Prerequisites:** macOS or Linux, Bun >= 1.0, Claude Code with active subscription

---

## Tester Selection Criteria

Ideal first testers:
- Comfortable with terminal and git clone
- Active Claude Code user (so they have a baseline to compare against)
- Willing to use their real workflow (not a synthetic task)
- Will give honest, structured feedback

Avoid:
- People who will be polite instead of honest
- Non-technical users (for v1 — that's a later test)

---

## Pre-Test Setup (Facilitator)

Before the tester begins:

1. Verify the repo is public and README is current
2. Confirm `setup.sh` runs clean on a fresh machine (no Jake-specific paths)
3. Prepare a clean test environment checklist:
   - [ ] Bun installed
   - [ ] Claude Code installed and authenticated
   - [ ] No existing `~/.claude/CLAUDE.md` (or tester is OK with it being overwritten)
   - [ ] No existing `~/.claude/settings.json` hooks (or tester knows to merge)
4. Send tester the test packet (this doc + feedback template below)

---

## Session 1: Cold Start (Day 1, ~20 min)

**What we're testing:** Can a new user install and get a working memory system from zero?

### Instructions to Tester

```
1. Clone and install:
   git clone https://github.com/RMSTrucks/operatoros.git
   cd operatoros
   bash setup.sh --guided

2. Answer the guided setup questions honestly (your real role, preferences, etc.)

3. Open Claude Code in any project you're actively working on:
   cd ~/your-project
   claude

4. Have a normal working session (~15 min). Do real work — don't perform for the test.
   Examples: ask Claude to explain code, fix a bug, write a function, review a file.

5. During the session, naturally mention:
   - Your name (if not already from setup)
   - Something about your role or what you're working on
   - A preference ("I prefer TypeScript over JavaScript" or "keep responses short")
   - Correct Claude on something (any correction — style, approach, naming)

6. End the session normally (Ctrl+C or /exit).

7. Immediately after: fill out Session 1 of the feedback template.
```

### Success Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| `setup.sh` completes without errors | Clean exit | Any error requiring manual fix |
| Vault directory created with expected structure | `self/`, `ops/`, `notes/mocs/` exist | Missing directories |
| Hooks fire on session start | Session-start output visible or context loaded | No hooks, Claude starts blank |
| Claude acknowledges it's a fresh start | Asks about you or references first session | Acts like default Claude |
| Session-end handoff written | File exists in `ops/session-handoff.md` (or equivalent) | No handoff artifact |

---

## Session 2: Does It Remember? (Day 2-3, ~20 min)

**What we're testing:** Does Claude pick up where it left off? Does it know who the tester is?

### Instructions to Tester

```
1. Open Claude Code in the same project directory:
   cd ~/your-project
   claude

2. Do NOT reintroduce yourself. Just start working.

3. Notice:
   - Does Claude greet you by name?
   - Does it reference your role or what you were working on?
   - Does it remember the correction you made in Session 1?
   - Does it remember your stated preference?

4. Work for ~15 min. Do real work again.

5. Intentionally repeat the same mistake Claude made in Session 1 scenario
   (e.g., ask it to do the thing it got wrong before). Does it self-correct?

6. Teach it something new: a project convention, a tool preference, a workflow.

7. End session. Fill out Session 2 feedback.
```

### Success Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| Claude knows your name without being told | Uses your name naturally | Asks "what's your name?" again |
| References prior session context | Mentions previous work, role, or preferences | Starts completely fresh |
| Remembers Session 1 correction | Avoids the corrected behavior | Repeats the same mistake |
| Loads handoff from Session 1 | Handoff content reflected in behavior | No continuity |
| Session 2 handoff written | Updated handoff artifact | Stale or missing |

---

## Session 3: Does It Compound? (Day 4-5, ~20 min)

**What we're testing:** Is the AI meaningfully better than a vanilla Claude Code session?

### Instructions to Tester

```
1. Open Claude Code in the same project:
   cd ~/your-project
   claude

2. Work normally for ~10 min.

3. Then explicitly test compounding:
   - Ask Claude what it knows about you
   - Ask it to summarize your project
   - Give it a task that requires context from Sessions 1 AND 2
   - Make a correction and see if it connects to the Session 1 correction pattern

4. Try one "stretch" task:
   - Ask Claude to anticipate what you might need next
   - Or ask it what patterns it's noticed in your work

5. End session. Fill out Session 3 feedback + the Overall Assessment.
```

### Success Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| Claude can summarize what it knows about you | Accurate, multi-session summary | Vague or wrong |
| Handles cross-session context task | Uses info from both prior sessions | Only knows current session |
| Corrections have compounded | Pattern of improvement visible | Still making corrected mistakes |
| Tester feels "this is better than vanilla" | Subjective but clear | "I don't notice a difference" |
| Vault contains meaningful content | Identity, corrections, handoffs populated | Mostly template boilerplate |

---

## Feedback Template

*Copy this to a separate file and give it to the tester.*

### Session 1 Feedback

```
Tester name:
Date:
OS / shell:
Bun version:
Claude Code version:

SETUP
- Did setup.sh run without errors? [yes/no]
- If no, what went wrong?
- How long did setup take? [minutes]
- Was the guided setup clear? [1-5, 5=very clear]
- Anything confusing about the instructions?

FIRST SESSION
- Did Claude seem to "know" it was a fresh OperatorOS install? [yes/no]
- Did it ask about you / try to learn? [yes/no]
- Did the session feel different from normal Claude Code? [yes/no]
- If yes, how?
- Did you notice any errors or weird behavior?
- Rate the first session experience: [1-5, 5=excellent]

NOTES (anything else):
```

### Session 2 Feedback

```
Date:
Time since Session 1:

MEMORY
- Did Claude remember your name? [yes/no]
- Did it reference your role/work? [yes/no]
- Did it remember your correction from Session 1? [yes/no]
- Did it remember your stated preference? [yes/no]
- Score memory quality: [1-5, 5=perfect recall]

CONTINUITY
- Did the session feel like a continuation? [yes/no]
- Or did it feel like starting over? [yes/no]
- Did you have to re-explain anything? [yes/no, what?]

BEHAVIOR
- Any errors or unexpected behavior?
- Rate Session 2 experience: [1-5, 5=excellent]

NOTES:
```

### Session 3 Feedback

```
Date:

COMPOUNDING
- Could Claude accurately describe what it knows about you? [yes/no]
- Did it handle the cross-session task? [yes/no, details]
- Did corrections compound? [yes/no, details]
- Could it anticipate your needs? [yes/no]
- Score compounding quality: [1-5, 5=genuinely impressive]

OVERALL ASSESSMENT
- Is this meaningfully better than vanilla Claude Code? [yes/no]
- Would you keep using OperatorOS? [yes/no]
- What's the single best thing about it?
- What's the single worst thing about it?
- What's missing that you expected?
- Would you recommend it to a colleague? [yes/no]
- Overall score: [1-10, 10=must-have]

OPEN FEEDBACK (say anything):
```

---

## Facilitator Post-Test Checklist

After all 3 sessions:

- [ ] Collect all feedback forms
- [ ] Ask tester to share their vault directory (anonymize if needed)
- [ ] Review vault contents: is the structure meaningful or just boilerplate?
- [ ] Check `ops/session-handoff.md` — does it have real session context?
- [ ] Check `ops/tool-lessons.md` — were any failures captured?
- [ ] Check `self/` files — were they populated from conversation?
- [ ] Identify setup friction points (anything that required manual intervention)
- [ ] Identify memory gaps (things mentioned but not retained)
- [ ] Identify false memories (things retained incorrectly)
- [ ] Write up findings and file as GitHub issue on the repo

---

## Known Blockers and Workarounds

| Blocker | Workaround |
|---------|------------|
| npx install not available (npm unpublished) | Use git clone path |
| Tester has existing `~/.claude/settings.json` | Manual hook merge required — provide instructions |
| Tester has existing `~/.claude/CLAUDE.md` | Backup first: `cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.bak` |
| Hooks don't fire | Verify `settings.json` has correct hook paths; check Bun is in PATH |
| Session handoff not written | Check `session-end.sh` is executable and vault path is correct |

---

## What We Learn From This

This test answers three questions:

1. **Can someone else install it?** — Setup friction, missing docs, assumed knowledge
2. **Does memory actually work?** — Not "does the code run" but "does the human feel remembered"
3. **Does it compound?** — The core thesis: is session 10 meaningfully better than session 1?

If the answer to #3 is "no" or "I can't tell," the product doesn't work yet, regardless of how clean the code is.
