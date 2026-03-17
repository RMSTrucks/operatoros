#!/usr/bin/env bash
# OperatorOS Session Start Hook
# Injects memory vault context at the beginning of every Claude Code session.
#
# Install: Add to ~/.claude/settings.json under hooks.SessionStart
# Input: JSON on stdin with {cwd, session_id, ...}
#
# This is the most important hook. It ensures every session starts with
# context from previous sessions, making Claude "remember" across conversations.

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

# --- Build Context ---
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
