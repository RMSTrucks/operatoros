#!/usr/bin/env bash
# OperatorOS Session End Hook
# Auto-generates session handoff when the session ends.
#
# Install: Add to ~/.claude/settings.json under hooks.SessionEnd
# Input: JSON on stdin with {cwd, reason, transcript_path, ...}
#
# If the session handoff is stale (not updated in the last 2 hours),
# this hook generates a basic handoff from recent git activity.

set -euo pipefail

INPUT=$(cat)

# --- Find vault ---
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null || echo "$HOME")
CLAUDE_PROJECTS="$HOME/.claude/projects"
PROJECT_KEY=$(echo "$CWD" | sed 's|^/||; s|/|-|g')
VAULT_DIR="$CLAUDE_PROJECTS/-${PROJECT_KEY}/memory"

# Fallback locations
if [ ! -d "$VAULT_DIR" ] 2>/dev/null; then
  for candidate in "$HOME/.claude/memory" "$HOME/.operatoros/vault"; do
    [ -d "$candidate" ] && VAULT_DIR="$candidate" && break
  done
fi

[ ! -d "$VAULT_DIR" ] 2>/dev/null && exit 0

HANDOFF="$VAULT_DIR/ops/session-handoff.md"
[ ! -f "$HANDOFF" ] && exit 0

# --- Check staleness ---
# If handoff was updated in the last 2 hours, assume the AI updated it during session
if [ "$(uname)" = "Darwin" ]; then
  LAST_MOD=$(stat -f %m "$HANDOFF" 2>/dev/null || echo "0")
else
  LAST_MOD=$(stat -c %Y "$HANDOFF" 2>/dev/null || echo "0")
fi
NOW=$(date +%s)
AGE=$(( NOW - LAST_MOD ))

if [ "$AGE" -lt 7200 ]; then
  # Handoff is fresh — the AI updated it during session. Nothing to do.
  exit 0
fi

# --- Auto-generate handoff from git activity ---
# The AI didn't update the handoff, so we generate a basic one from recent commits.
REASON=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('reason','unknown'))" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Collect recent git commits from common locations
RECENT_COMMITS=""
for repo_dir in "$CWD" "$HOME" "$HOME/openclaw" "$HOME/genesis-tools" "$HOME/operatoros"; do
  if [ -d "$repo_dir/.git" ]; then
    COMMITS=$(cd "$repo_dir" && git log --oneline --since="4 hours ago" 2>/dev/null | head -5)
    if [ -n "$COMMITS" ]; then
      REPO_NAME=$(basename "$repo_dir")
      RECENT_COMMITS="${RECENT_COMMITS}\n### ${REPO_NAME}\n\`\`\`\n${COMMITS}\n\`\`\`\n"
    fi
  fi
done

# Capture Paperclip state if available
PAPERCLIP_STATE=""
if curl -s --max-time 2 "http://127.0.0.1:3100/api/companies" > /dev/null 2>&1; then
  PAPERCLIP_STATE=$(curl -s --max-time 5 "http://127.0.0.1:3100/api/companies" 2>/dev/null | python3 -c "
import json, sys
try:
    companies = json.load(sys.stdin)
    lines = []
    for c in sorted(companies, key=lambda x: x['spentMonthlyCents'], reverse=True):
        name = c['name']
        prefix = c['issuePrefix']
        spent = c['spentMonthlyCents'] / 100
        counter = c['issueCounter']
        lines.append(f'| {name} | {prefix} | {counter} issues | \${spent:.2f} spent |')
    print('| Company | Prefix | Issues | Spend |')
    print('|---------|--------|--------|-------|')
    print('\n'.join(lines))
except:
    pass
" 2>/dev/null || echo "")
fi

# Write auto-generated handoff
cat > "$HANDOFF" << EOF
---
title: Session Handoff
description: What happened last session, what's active, what's next -- READ THIS FIRST
type: ops
updated: $(date +%Y-%m-%d)
---

# Session Handoff (auto-generated)

**Last session:** $TIMESTAMP
**Ended because:** $REASON
**Note:** This handoff was auto-generated because the AI did not update it during the session. It may be incomplete.

## Active Work

<!-- active_work_start -->
- Check active-threads.md and Paperclip for current state
<!-- active_work_end -->

## Recent Git Activity

$(echo -e "$RECENT_COMMITS")

## System State

<!-- system_state_start -->
$PAPERCLIP_STATE
<!-- system_state_end -->

## Next Session Should

<!-- next_actions_start -->
- Review what was done and update this handoff with proper context
- Check active-threads.md for ongoing work
<!-- next_actions_end -->
EOF
