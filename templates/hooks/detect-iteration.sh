#!/usr/bin/env bash
# OperatorOS Detect Iteration Hook
# Warns when the AI is running similar commands repeatedly (sign of being stuck).
#
# Install: Add to ~/.claude/settings.json under hooks.PostToolUse
#          with matcher: "Bash"
# Input: JSON on stdin with {tool_input.command, session_id, ...}
#
# Tracks commands in /tmp and warns after 3+ similar commands in the same session.

set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
[ "$TOOL_NAME" != "Bash" ] && exit 0

# Extract command and session
COMMAND=$(echo "$INPUT" | python3 -c "import json,sys; print((json.load(sys.stdin).get('tool_input',{}) or {}).get('command','')[:80])" 2>/dev/null || echo "")
SESSION=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id','default'))" 2>/dev/null || echo "default")

[ -z "$COMMAND" ] && exit 0

# Normalize command (strip arguments, keep base command)
BASE_CMD=$(echo "$COMMAND" | awk '{print $1}')
TRACK_FILE="/tmp/operatoros-iteration-${SESSION}"

# Record this command
echo "$BASE_CMD" >> "$TRACK_FILE" 2>/dev/null || exit 0

# Count occurrences of this base command
COUNT=$(grep -c "^${BASE_CMD}$" "$TRACK_FILE" 2>/dev/null || echo "0")

if [ "$COUNT" -ge 3 ]; then
  echo "WARNING: You've run '$BASE_CMD' $COUNT times this session. If you're stuck, try a different approach." >&2
fi

# Cleanup: limit file to last 50 commands
if [ -f "$TRACK_FILE" ]; then
  tail -50 "$TRACK_FILE" > "${TRACK_FILE}.tmp" 2>/dev/null && mv "${TRACK_FILE}.tmp" "$TRACK_FILE" 2>/dev/null || true
fi
