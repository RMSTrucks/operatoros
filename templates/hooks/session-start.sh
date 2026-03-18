#!/usr/bin/env bash
# OperatorOS Session Start Hook
# Injects memory vault context at the beginning of every Claude Code session.
#
# If the vault is empty (new user), injects the First Conversation prompt
# instead — the seed that asks who you are and starts building your AI.
#
# Install: Add to ~/.claude/settings.json under hooks.SessionStart
# Input: JSON on stdin with {cwd, session_id, ...}

set -euo pipefail

# Read hook input (required by Claude Code hook protocol)
INPUT=$(cat)

# --- Configuration ---
# Find the memory vault. Check project-specific first, then global.
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null || echo "")

# Look for vault in Claude's project memory directory
CLAUDE_PROJECTS="$HOME/.claude/projects"
if [ -n "$CWD" ]; then
  # Convert cwd to Claude's project path format (slashes become dashes)
  PROJECT_KEY=$(echo "$CWD" | sed 's|^/||; s|/|-|g')
  VAULT_DIR="$CLAUDE_PROJECTS/-${PROJECT_KEY}/memory"
fi

# Fallback: check common locations
if [ ! -d "$VAULT_DIR" ] 2>/dev/null; then
  for candidate in \
    "$HOME/.claude/memory" \
    "$HOME/.operatoros/vault" \
    "$CWD/.claude/memory"; do
    if [ -d "$candidate" ]; then
      VAULT_DIR="$candidate"
      break
    fi
  done
fi

if [ ! -d "$VAULT_DIR" ] 2>/dev/null; then
  # No vault found — nothing to inject
  exit 0
fi

# --- Check if this is a new user (empty vault) ---
IDENTITY="$VAULT_DIR/self/identity.md"
IDENTITY_CONTENT=""
if [ -f "$IDENTITY" ]; then
  # Strip frontmatter and check if there's real content beyond the template
  IDENTITY_CONTENT=$(sed -n '/^---$/,/^---$/!p' "$IDENTITY" | grep -v '^#' | grep -v '^\s*$' | grep -v '^\[' | grep -v '^<!--' | head -5)
fi

if [ -z "$IDENTITY_CONTENT" ]; then
  # Empty vault — inject First Conversation prompt
  FIRST_CONVO="$VAULT_DIR/../first-conversation.md"
  if [ -f "$FIRST_CONVO" ]; then
    cat "$FIRST_CONVO"
  else
    # Inline fallback if the file doesn't exist
    cat << 'SEED'
[FIRST CONVERSATION]

This is your first session with OperatorOS. The memory vault is empty — no identity, no preferences, no history. Everything starts here.

Your job right now is NOT to code, NOT to configure, NOT to set anything up. Your job is to LISTEN.

Start a conversation with the person in front of you. Learn who they are. Here's how:

1. Introduce yourself briefly — you're their AI partner, and you get better over time by learning about them.

2. Ask them to tell you about themselves:
   - What do they do? (role, work, interests)
   - What are they working on right now?
   - What frustrates them about AI assistants?
   - How do they prefer to communicate? (concise vs detailed, formal vs casual)

3. As they talk, listen for:
   - Their name and role
   - Their technical level (developer, business owner, student, etc.)
   - Their working style and preferences
   - Current projects or goals
   - Pain points you can help with

4. After the conversation, save what you learned:
   - Write their identity to self/identity.md
   - Write your understanding of them to self/principal.md
   - Note their preferences in self/methodology.md
   - If they mentioned projects, start ops/active-threads.md

5. Tell them what you saved and that you'll remember it next time.

Be warm. Be genuine. This is the first impression — it determines whether they keep talking to you or close the tab. Don't be a form. Don't be a questionnaire. Be someone who genuinely wants to understand them so you can help.

[END FIRST CONVERSATION]
SEED
  fi
  exit 0
fi

# --- Returning user: Build Context ---
echo "[OPERATOR DESK]"
echo ""

# 1. Session handoff (most important — what happened last time)
HANDOFF="$VAULT_DIR/ops/session-handoff.md"
if [ -f "$HANDOFF" ]; then
  echo "=== PREVIOUS SESSION HANDOFF ==="
  # Strip frontmatter, show content
  sed -n '/^---$/,/^---$/!p' "$HANDOFF" | head -40
  echo ""
fi

# 2. Active threads
THREADS="$VAULT_DIR/ops/active-threads.md"
if [ -f "$THREADS" ]; then
  echo "=== ACTIVE THREADS ==="
  sed -n '/^---$/,/^---$/!p' "$THREADS" | head -30
  echo ""
fi

# 3. Known issues (gotchas)
ISSUES="$VAULT_DIR/ops/known-issues.md"
if [ -f "$ISSUES" ]; then
  ISSUE_COUNT=$(grep -c "^### " "$ISSUES" 2>/dev/null || echo "0")
  if [ "$ISSUE_COUNT" -gt 0 ]; then
    echo "=== KNOWN ISSUES ($ISSUE_COUNT) ==="
    # Just show titles, not full content
    grep "^### " "$ISSUES" | head -10
    echo ""
  fi
fi

# 4. Recent tool lessons (if any)
LESSONS="$VAULT_DIR/ops/tool-lessons.md"
if [ -f "$LESSONS" ]; then
  LESSON_COUNT=$(grep -c "^|" "$LESSONS" 2>/dev/null || echo "0")
  LESSON_COUNT=$((LESSON_COUNT - 1)) # subtract header row
  if [ "$LESSON_COUNT" -gt 0 ]; then
    echo "=== RECENT TOOL LESSONS ($LESSON_COUNT) ==="
    tail -5 "$LESSONS"
    echo ""
  fi
fi

# 5. Hard rules from MEMORY.md
MEMORY_INDEX="$VAULT_DIR/MEMORY.md"
if [ -f "$MEMORY_INDEX" ]; then
  RULES=$(sed -n '/^## Hard Rules/,/^##/p' "$MEMORY_INDEX" | head -10)
  if [ -n "$RULES" ]; then
    echo "=== HARD RULES ==="
    echo "$RULES"
    echo ""
  fi
fi

echo "[END DESK]"
