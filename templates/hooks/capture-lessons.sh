#!/usr/bin/env bash
# OperatorOS Capture Lessons Hook
# Auto-records Bash tool failures to ops/tool-lessons.md
#
# Install: Add to ~/.claude/settings.json under hooks.PostToolUse
#          with matcher: "Bash"
# Input: JSON on stdin with {tool_name, tool_input.command, tool_output, ...}
#
# When a Bash command fails, this captures the command and error so the AI
# can learn from its mistakes across sessions.

set -euo pipefail

INPUT=$(cat)

# Only process Bash tool failures
TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")
[ "$TOOL_NAME" != "Bash" ] && exit 0

# Check if the command failed (non-zero exit or error patterns)
OUTPUT=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
output = data.get('tool_output', '') or ''
# Check for common error patterns
error_patterns = ['error:', 'Error:', 'ERROR', 'command not found', 'No such file',
                  'Permission denied', 'fatal:', 'FATAL', 'panic:', 'Traceback',
                  'ModuleNotFoundError', 'ImportError', 'SyntaxError', 'TypeError']
has_error = any(p in output for p in error_patterns)
exit_code = data.get('tool_result', {}).get('exit_code', 0) if isinstance(data.get('tool_result'), dict) else 0
if has_error or exit_code != 0:
    cmd = (data.get('tool_input', {}) or {}).get('command', 'unknown')[:100]
    err = output[:200].replace('\n', ' ').strip()
    print(f'{cmd}|||{err}')
else:
    print('')
" 2>/dev/null || echo "")

[ -z "$OUTPUT" ] && exit 0

COMMAND=$(echo "$OUTPUT" | cut -d'|' -f1-1)
ERROR=$(echo "$OUTPUT" | cut -d'|' -f4-)

# --- Find vault ---
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null || echo "$HOME")
CLAUDE_PROJECTS="$HOME/.claude/projects"
PROJECT_KEY=$(echo "$CWD" | sed 's|^/||; s|/|-|g')
VAULT_DIR="$CLAUDE_PROJECTS/-${PROJECT_KEY}/memory"

if [ ! -d "$VAULT_DIR" ] 2>/dev/null; then
  for candidate in "$HOME/.claude/memory" "$HOME/.operatoros/vault"; do
    [ -d "$candidate" ] && VAULT_DIR="$candidate" && break
  done
fi

[ ! -d "$VAULT_DIR" ] 2>/dev/null && exit 0

LESSONS="$VAULT_DIR/ops/tool-lessons.md"
[ ! -f "$LESSONS" ] && exit 0

# Append the lesson
DATE=$(date +%Y-%m-%d)
echo "| $DATE | Bash | $COMMAND | $ERROR |" >> "$LESSONS"
