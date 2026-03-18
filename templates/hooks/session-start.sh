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
# A vault is "cold" if identity.md is missing, empty, or still contains
# template placeholders like [YOUR_NAME] or [describe your...].
IDENTITY="$VAULT_DIR/self/identity.md"
IDENTITY_CONTENT=""
if [ -f "$IDENTITY" ]; then
  # Strip frontmatter, headings, blanks, comments, and any line
  # containing [PLACEHOLDER] template brackets (unfilled templates).
  IDENTITY_CONTENT=$(sed -n '/^---$/,/^---$/!p' "$IDENTITY" \
    | grep -v '^#' \
    | grep -v '^\s*$' \
    | grep -v '^\[' \
    | grep -v '^<!--' \
    | grep -v '\[.*\]' \
    | head -5)
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

This is a fresh OperatorOS install. The memory vault is empty. Everything starts now.

You have one job this session: meet the person in front of you.

Don't configure anything. Don't write code. Just talk. Open naturally — introduce yourself as their AI partner, say you don't know anything about them yet but you will, and ask what they do, what they're working on, and what they wish AI was actually good at. Then listen.

As they talk, pick up on who they are — their name, role, technical level, communication style, what they're working on, what frustrates them. Don't turn it into a checklist.

When you have a feel for them, save what you learned to the vault (self/principal.md, self/identity.md, self/methodology.md, ops/active-threads.md). Read it back. Let them correct you. Tell them you'll remember next time.

Be a colleague on day one, not a butler. Be warm but honest. This first conversation is the seed — everything grows from here.

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
