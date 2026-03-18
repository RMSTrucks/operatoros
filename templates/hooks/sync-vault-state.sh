#!/usr/bin/env bash
# OperatorOS Vault State Sync
# Queries Paperclip and writes current state into vault files.
# Run via cron every 2 hours, or manually.
#
# Usage: bash sync-vault-state.sh [--vault-dir DIR]
#
# Updates:
#   ops/active-threads.md — appends/replaces auto-generated Paperclip section
#   ops/session-handoff.md — updates system_state section

set -euo pipefail

VAULT_DIR=""
PAPERCLIP_URL="${PAPERCLIP_API_URL:-http://127.0.0.1:3100}"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-dir) VAULT_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Auto-detect vault
if [ -z "$VAULT_DIR" ]; then
  HOME_PROJECT_KEY=$(echo "$HOME" | sed 's|^/||; s|/|-|g')
  VAULT_DIR="$HOME/.claude/projects/-${HOME_PROJECT_KEY}/memory"
fi

[ ! -d "$VAULT_DIR" ] && echo "No vault at $VAULT_DIR" && exit 0

# --- Check Paperclip is running ---
if ! curl -s --max-time 2 "$PAPERCLIP_URL/api/companies" > /dev/null 2>&1; then
  echo "Paperclip not reachable at $PAPERCLIP_URL — skipping sync"
  exit 0
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Query all companies and their issues ---
PAPERCLIP_DATA=$(curl -s --max-time 10 "$PAPERCLIP_URL/api/companies" 2>/dev/null)

ACTIVE_SECTION=$(echo "$PAPERCLIP_DATA" | python3 -c "
import json, sys, urllib.request

data = json.load(sys.stdin)
base = '${PAPERCLIP_URL}'
lines = []

for company in sorted(data, key=lambda x: x.get('name','')):
    cid = company['id']
    name = company['name']
    prefix = company.get('issuePrefix', '?')

    # Fetch in_progress and todo issues
    try:
        req = urllib.request.Request(f'{base}/api/companies/{cid}/issues?status=todo,in_progress,blocked')
        with urllib.request.urlopen(req, timeout=5) as resp:
            issues = json.loads(resp.read())
    except:
        issues = []

    if not issues:
        lines.append(f'### {name} ({prefix})')
        lines.append('')
        lines.append('No active issues.')
        lines.append('')
        continue

    lines.append(f'### {name} ({prefix})')
    lines.append('')

    for status in ['in_progress', 'todo', 'blocked']:
        status_issues = [i for i in issues if i.get('status') == status]
        if not status_issues:
            continue
        label = {'in_progress': 'In Progress', 'todo': 'To Do', 'blocked': 'Blocked'}[status]
        for issue in status_issues:
            ident = issue.get('identifier', '?')
            title = issue.get('title', 'Untitled')[:80]
            assignee = issue.get('executionAgentNameKey') or issue.get('assigneeAgentId', 'unassigned')
            if assignee and len(assignee) > 20:
                assignee = assignee[:8] + '...'
            lines.append(f'- **{ident}** [{label}] {title} ({assignee})')

    lines.append('')

print('\n'.join(lines))
" 2>/dev/null || echo "Failed to query Paperclip")

# --- Update active-threads.md ---
THREADS_FILE="$VAULT_DIR/ops/active-threads.md"
if [ -f "$THREADS_FILE" ]; then
  AUTO_START="<!-- PAPERCLIP_STATE_START -->"
  AUTO_END="<!-- PAPERCLIP_STATE_END -->"

  # Remove existing auto section
  if grep -q "$AUTO_START" "$THREADS_FILE" 2>/dev/null; then
    sed -i "/$AUTO_START/,/$AUTO_END/d" "$THREADS_FILE" 2>/dev/null || true
  fi

  # Append new auto section
  cat >> "$THREADS_FILE" << SECTION

$AUTO_START
## Paperclip State (auto-synced $TIMESTAMP)

$ACTIVE_SECTION
$AUTO_END
SECTION

  echo "[SYNC] Updated active-threads.md at $TIMESTAMP"
fi

# --- Update session-handoff.md system_state section ---
HANDOFF="$VAULT_DIR/ops/session-handoff.md"
if [ -f "$HANDOFF" ]; then
  STATE_START="<!-- system_state_start -->"
  STATE_END="<!-- system_state_end -->"

  if grep -q "$STATE_START" "$HANDOFF" 2>/dev/null; then
    # Build company summary table
    COMPANY_TABLE=$(echo "$PAPERCLIP_DATA" | python3 -c "
import json, sys
try:
    companies = json.load(sys.stdin)
    lines = ['| Company | Prefix | Issues | Spend |', '|---------|--------|--------|-------|']
    for c in sorted(companies, key=lambda x: x['spentMonthlyCents'], reverse=True):
        name = c['name']
        prefix = c['issuePrefix']
        spent = c['spentMonthlyCents'] / 100
        counter = c['issueCounter']
        lines.append(f'| {name} | {prefix} | {counter} issues | \${spent:.2f} spent |')
    print('\n'.join(lines))
except:
    print('Paperclip data unavailable')
" 2>/dev/null || echo "Paperclip data unavailable")

    # Replace content between markers using python to handle multiline
    python3 -c "
import sys
with open('$HANDOFF', 'r') as f:
    content = f.read()

start_marker = '$STATE_START'
end_marker = '$STATE_END'
start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx >= 0 and end_idx >= 0:
    new_content = content[:start_idx + len(start_marker)] + '''
$COMPANY_TABLE
*Last synced: $TIMESTAMP*
''' + content[end_idx:]
    with open('$HANDOFF', 'w') as f:
        f.write(new_content)
" 2>/dev/null

    echo "[SYNC] Updated session-handoff.md system state at $TIMESTAMP"
  fi
fi
