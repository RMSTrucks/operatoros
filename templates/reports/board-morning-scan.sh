#!/usr/bin/env bash
# Board Morning Scan — holding company status across all Paperclip companies
#
# Produces a summary of:
#   - Per-company: done since yesterday, in_progress, blocked, stuck
#   - Agent activity: heartbeats, timeouts
#   - Spend tracker per company
#   - Alerts: stuck issues, failed agents
#
# Usage:
#   bash board-morning-scan.sh                    # stdout only
#   bash board-morning-scan.sh --telegram         # stdout + Telegram
#   bash board-morning-scan.sh --vault-dir DIR    # write to vault
#
# Env:
#   PAPERCLIP_API_URL   — Paperclip server (default: http://127.0.0.1:3100)
#   GENESIS_TOOLS_URL   — genesis-tools worker URL (for Telegram)
#   GENESIS_TOOLS_TOKEN — auth token
#   TELEGRAM_CHAT_ID    — Telegram chat ID

set -euo pipefail

PAPERCLIP_URL="${PAPERCLIP_API_URL:-http://127.0.0.1:3100}"
SEND_TELEGRAM=false
VAULT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --telegram) SEND_TELEGRAM=true; shift ;;
    --vault-dir) VAULT_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Auto-detect vault
if [ -z "$VAULT_DIR" ]; then
  HOME_PROJECT_KEY=$(echo "$HOME" | sed 's|^/||; s|/|-|g')
  VAULT_DIR="$HOME/.claude/projects/-${HOME_PROJECT_KEY}/memory"
fi

# Check Paperclip
if ! curl -s --max-time 3 "$PAPERCLIP_URL/api/companies" > /dev/null 2>&1; then
  echo "ERROR: Paperclip not reachable at $PAPERCLIP_URL"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
YESTERDAY=$(date -u -d "yesterday" +"%Y-%m-%dT00:00:00Z" 2>/dev/null || date -u -v-1d +"%Y-%m-%dT00:00:00Z" 2>/dev/null || echo "")

# --- Generate report ---
export PAPERCLIP_SCAN_URL="$PAPERCLIP_URL"
REPORT=$(python3 << 'PYEOF'
import json, sys, os, urllib.request
from datetime import datetime, timedelta, timezone

base = os.environ.get("PAPERCLIP_SCAN_URL", "http://127.0.0.1:3100")
yesterday = datetime.now(timezone.utc) - timedelta(days=1)

def api_get(path):
    try:
        req = urllib.request.Request(f"{base}{path}")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data if isinstance(data, list) else []
    except:
        return []

companies = api_get("/api/companies")

lines = []
lines.append("# Board Morning Scan")
lines.append(f"*{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}*")
lines.append("")

total_spent = 0
total_issues = 0
alerts = []

for company in sorted(companies, key=lambda x: x.get("name", "")):
    cid = company["id"]
    name = company["name"]
    prefix = company.get("issuePrefix", "?")
    spent = company.get("spentMonthlyCents", 0) / 100
    total_spent += spent

    # Get all issues
    all_issues = api_get(f"/api/companies/{cid}/issues")
    total_issues += len(all_issues)

    # Categorize
    done_recent = [i for i in all_issues if i.get("status") == "done"
                   and i.get("completedAt", "") >= yesterday.isoformat()]
    in_progress = [i for i in all_issues if i.get("status") == "in_progress"]
    blocked = [i for i in all_issues if i.get("status") == "blocked"]
    todo = [i for i in all_issues if i.get("status") == "todo"]
    backlog = [i for i in all_issues if i.get("status") == "backlog"]

    # Detect stuck: in_progress for >24h without recent activity
    stuck = []
    for issue in in_progress:
        started = issue.get("startedAt", "")
        if started and started < yesterday.isoformat():
            stuck.append(issue)

    lines.append(f"## {name} ({prefix}) — ${spent:.2f}")
    lines.append(f"Done(24h): {len(done_recent)} | Active: {len(in_progress)} | "
                 f"Todo: {len(todo)} | Blocked: {len(blocked)} | Backlog: {len(backlog)}")

    if done_recent:
        for i in done_recent:
            lines.append(f"  [DONE] {i.get('identifier','?')} {i.get('title','')[:60]}")

    if in_progress:
        for i in in_progress:
            agent = i.get("executionAgentNameKey") or "?"
            lines.append(f"  [WIP]  {i.get('identifier','?')} {i.get('title','')[:50]} ({agent})")

    if blocked:
        for i in blocked:
            lines.append(f"  [BLOCKED] {i.get('identifier','?')} {i.get('title','')[:55]}")
            alerts.append(f"BLOCKED: {i.get('identifier','?')} in {name}")

    if stuck:
        for i in stuck:
            lines.append(f"  [STUCK] {i.get('identifier','?')} {i.get('title','')[:55]}")
            alerts.append(f"STUCK >24h: {i.get('identifier','?')} in {name}")

    lines.append("")

# Get agents
agents = api_get("/api/companies") # We'd need per-company agent data
# For now, summarize across companies
all_agents = []
for company in companies:
    cid = company["id"]
    agents = api_get(f"/api/companies/{cid}/agents")
    for a in agents:
        all_agents.append({
            "name": a.get("name", "?"),
            "company": company["name"],
            "status": a.get("status", "?"),
            "spent": a.get("spentMonthlyCents", 0) / 100,
            "last_heartbeat": a.get("lastHeartbeatAt", "never")
        })

lines.append("## Agent Activity")
for a in sorted(all_agents, key=lambda x: -x["spent"]):
    hb = (a["last_heartbeat"] or "never")[:16]
    lines.append(f"  {a['name']:20s} ({a['company']:12s}) ${a['spent']:6.2f} last:{hb}")
lines.append("")

# Summary
lines.append("## Summary")
lines.append(f"Companies: {len(companies)} | Total issues: {total_issues} | "
             f"Monthly spend: ${total_spent:.2f}")

if alerts:
    lines.append("")
    lines.append("## ALERTS")
    for a in alerts:
        lines.append(f"  WARNING: {a}")

print("\n".join(lines))
PYEOF
)

echo "$REPORT"

# --- Write to vault ---
if [ -d "$VAULT_DIR/ops" ]; then
  echo "$REPORT" > "$VAULT_DIR/ops/morning-scan.md"
  echo "" >&2
  echo "[SCAN] Written to $VAULT_DIR/ops/morning-scan.md" >&2
fi

# --- Send Telegram ---
if [ "$SEND_TELEGRAM" = true ] && [ -n "${GENESIS_TOOLS_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  # Truncate for Telegram (4096 char limit)
  TG_MSG=$(echo "$REPORT" | head -c 3900)

  TG_PAYLOAD=$(echo "$TG_MSG" | python3 -c "
import json, sys
msg = sys.stdin.read()
print(json.dumps({'tool':'messaging','params':{'platform':'telegram','chat_id':'${TELEGRAM_CHAT_ID}','message':msg}}))
")

  curl -s -X POST "${GENESIS_TOOLS_URL}/call" \
    -H "Authorization: Bearer $GENESIS_TOOLS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TG_PAYLOAD" > /dev/null 2>&1

  echo "[SCAN] Sent to Telegram" >&2
fi
