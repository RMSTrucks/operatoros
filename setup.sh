#!/usr/bin/env bash
# OperatorOS Setup Script
#
# Sets up the memory vault, hooks, and CLAUDE.md templates.
# Run once to bootstrap. Everything is local, nothing phones home.
#
# Usage: bash setup.sh [--vault-dir DIR] [--name YOUR_NAME] [--guided]

set -euo pipefail

# --- Defaults ---
VAULT_DIR=""
USER_NAME=""
GUIDED=false
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"
TODAY=$(date +%Y-%m-%d)

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-dir) VAULT_DIR="$2"; shift 2 ;;
    --name) USER_NAME="$2"; shift 2 ;;
    --guided) GUIDED=true; shift ;;
    -h|--help)
      echo "Usage: bash setup.sh [--vault-dir DIR] [--name YOUR_NAME] [--guided]"
      echo ""
      echo "Options:"
      echo "  --vault-dir DIR    Where to create the memory vault (default: auto-detect)"
      echo "  --name NAME        Your name (used in templates)"
      echo "  --guided           Interactive onboarding — answers questions to populate vault"
      echo ""
      echo "This script sets up:"
      echo "  1. Memory vault (self/, ops/, notes/ with templates)"
      echo "  2. Session hooks (session-start, session-end, capture-lessons)"
      echo "  3. CLAUDE.md templates (global + project)"
      echo "  4. Notifications (multi-channel alerting)"
      echo "  5. Observatory (metrics collection + alerting framework)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Interactive prompts if not provided ---
if [ -z "$USER_NAME" ]; then
  read -p "What's your name? " USER_NAME
  [ -z "$USER_NAME" ] && echo "Name is required." && exit 1
fi

if [ -z "$VAULT_DIR" ]; then
  # Auto-detect: use Claude's project memory directory for home
  HOME_PROJECT_KEY=$(echo "$HOME" | sed 's|^/||; s|/|-|g')
  DEFAULT_DIR="$HOME/.claude/projects/-${HOME_PROJECT_KEY}/memory"
  echo ""
  echo "Where should the memory vault go?"
  echo "  Default: $DEFAULT_DIR"
  read -p "  [Enter for default, or type a path]: " VAULT_DIR
  [ -z "$VAULT_DIR" ] && VAULT_DIR="$DEFAULT_DIR"
fi

echo ""
echo "=== OperatorOS Setup ==="
echo "  Name:  $USER_NAME"
echo "  Vault: $VAULT_DIR"
echo ""

# --- Create vault ---
echo "[1/4] Creating memory vault..."

if [ -d "$VAULT_DIR" ]; then
  echo "  Vault directory already exists. Skipping files that exist, creating missing ones."
fi

mkdir -p "$VAULT_DIR"/{self,ops,notes/mocs}

# Copy templates, don't overwrite existing
for template in $(find "$TEMPLATES/vault" -type f); do
  relative="${template#$TEMPLATES/vault/}"
  target="$VAULT_DIR/$relative"
  if [ ! -f "$target" ]; then
    cp "$template" "$target"
    # Replace placeholders
    sed -i "s/SETUP_DATE/$TODAY/g" "$target" 2>/dev/null || true
    sed -i "s/\[YOUR_NAME\]/$USER_NAME/g" "$target" 2>/dev/null || true
    echo "  Created: $relative"
  else
    echo "  Exists:  $relative (skipped)"
  fi
done

# --- Install hooks ---
echo ""
echo "[2/4] Installing hooks..."

HOOKS_DIR="$HOME/.claude/hooks"
mkdir -p "$HOOKS_DIR"

for hook in session-start.sh session-end.sh capture-lessons.sh detect-iteration.sh; do
  target="$HOOKS_DIR/$hook"
  if [ ! -f "$target" ]; then
    cp "$TEMPLATES/hooks/$hook" "$target"
    chmod +x "$target"
    echo "  Installed: $hook"
  else
    echo "  Exists:    $hook (skipped)"
  fi
done

# --- CLAUDE.md templates ---
echo ""
echo "[3/4] Setting up CLAUDE.md..."

GLOBAL_CLAUDE="$HOME/.claude/CLAUDE.md"
if [ ! -f "$GLOBAL_CLAUDE" ]; then
  cp "$TEMPLATES/claude-md/global-claude-md.md" "$GLOBAL_CLAUDE"
  sed -i "s/\[Your Name\]/$USER_NAME/g" "$GLOBAL_CLAUDE" 2>/dev/null || true
  echo "  Created: ~/.claude/CLAUDE.md (global)"
else
  echo "  Exists:  ~/.claude/CLAUDE.md (skipped — your existing config is preserved)"
fi

PROJECT_CLAUDE="$HOME/CLAUDE.md"
if [ ! -f "$PROJECT_CLAUDE" ]; then
  cp "$TEMPLATES/claude-md/project-claude-md.md" "$PROJECT_CLAUDE"
  echo "  Created: ~/CLAUDE.md (project template)"
else
  echo "  Exists:  ~/CLAUDE.md (skipped)"
fi

# Copy the layering guide to the vault for reference
cp "$TEMPLATES/claude-md/layering-guide.md" "$VAULT_DIR/notes/" 2>/dev/null || true

# --- Configure hooks in settings.json ---
echo ""
echo "[4/4] Configuring Claude Code settings..."

SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
  # Check if hooks are already configured
  if grep -q "session-start.sh" "$SETTINGS" 2>/dev/null; then
    echo "  Hooks already configured in settings.json"
  else
    echo "  WARNING: settings.json exists but hooks are not configured."
    echo "  Please manually merge the hooks from:"
    echo "    $TEMPLATES/hooks/settings-snippet.json"
    echo "  into your existing settings.json"
    echo ""
    echo "  Or add these hooks manually in Claude Code:"
    echo "    /hooks add SessionStart 'bash ~/.claude/hooks/session-start.sh'"
    echo "    /hooks add SessionEnd 'bash ~/.claude/hooks/session-end.sh'"
    echo "    /hooks add PostToolUse:Bash 'bash ~/.claude/hooks/capture-lessons.sh'"
  fi
else
  # Create settings.json with hooks
  cp "$TEMPLATES/hooks/settings-snippet.json" "$SETTINGS"
  echo "  Created: settings.json with hooks configured"
fi

# --- Notifications ---
echo ""
echo "[5/6] Setting up Notifications..."

NOTIF_DIR="$HOME/.operatoros/notifications"
if [ ! -d "$NOTIF_DIR" ]; then
  mkdir -p "$NOTIF_DIR/channels"

  for file in types.ts notify.ts config.example.ts; do
    if [ -f "$TEMPLATES/notifications/$file" ]; then
      cp "$TEMPLATES/notifications/$file" "$NOTIF_DIR/$file"
      echo "  Created: notifications/$file"
    fi
  done

  for channel in "$TEMPLATES/notifications/channels/"*.ts; do
    if [ -f "$channel" ]; then
      name=$(basename "$channel")
      cp "$channel" "$NOTIF_DIR/channels/$name"
      echo "  Created: notifications/channels/$name"
    fi
  done

  if [ -f "$TEMPLATES/notifications/README.md" ]; then
    cp "$TEMPLATES/notifications/README.md" "$NOTIF_DIR/README.md"
  fi

  echo "  Notifications installed at: $NOTIF_DIR"
  echo "  Copy config.example.ts to config.ts and customize."
else
  echo "  Notifications already exist at $NOTIF_DIR (skipped)"
fi

# --- Observatory ---
echo ""
echo "[6/6] Setting up Observatory..."

OBS_DIR="$HOME/.operatoros/observatory"
if [ ! -d "$OBS_DIR" ]; then
  mkdir -p "$OBS_DIR"/{collectors,data,lib}

  # Copy observatory framework files
  for file in types.ts common.ts server.ts scanner.ts alert-rules.ts expectations.ts; do
    if [ -f "$TEMPLATES/observatory/$file" ]; then
      cp "$TEMPLATES/observatory/$file" "$OBS_DIR/$file"
      echo "  Created: observatory/$file"
    fi
  done

  # Copy example collectors
  for collector in "$TEMPLATES/observatory/collectors/"*.ts; do
    if [ -f "$collector" ]; then
      name=$(basename "$collector")
      cp "$collector" "$OBS_DIR/collectors/$name"
      echo "  Created: observatory/collectors/$name"
    fi
  done

  # Copy README
  if [ -f "$TEMPLATES/observatory/README.md" ]; then
    cp "$TEMPLATES/observatory/README.md" "$OBS_DIR/README.md"
  fi

  echo "  Observatory installed at: $OBS_DIR"
  echo ""
  echo "  To start the observatory server:"
  echo "    bun $OBS_DIR/server.ts"
  echo ""
  echo "  To run a scan:"
  echo "    bun $OBS_DIR/scanner.ts"
else
  echo "  Observatory already exists at $OBS_DIR (skipped)"
fi

# --- Guided Identity Setup ---
if [ "$GUIDED" = true ]; then
  echo ""
  echo "=== Guided Identity Setup ==="
  echo ""
  echo "I'll ask you a few questions to personalize your operator."
  echo "Press Enter to skip any question and fill it in later."
  echo ""

  # --- Principal (self/principal.md) ---
  echo "--- About You (the principal) ---"
  echo ""

  read -p "What's your role? (e.g., software engineer, founder, data scientist): " ROLE
  read -p "What do you care most about? (e.g., shipping fast, code quality, learning): " VALUES
  read -p "How do you like to communicate? (e.g., concise, detailed, casual): " COMM_STYLE
  read -p "What frustrates you about AI assistants? (e.g., verbose, guesses wrong, slow): " FRUSTRATIONS
  read -p "How do you like to work with AI? (e.g., delegate aggressively, review everything, pair): " WORK_STYLE
  read -p "What timezone are you in? (e.g., US/Central, UTC, Europe/London): " TIMEZONE

  PRINCIPAL_FILE="$VAULT_DIR/self/principal.md"
  if [ -n "$ROLE" ] || [ -n "$VALUES" ]; then
    cat > "$PRINCIPAL_FILE" <<PRINCIPAL_EOF
---
title: Principal
description: Who I work for -- their preferences, communication style, and working patterns
type: self
created: $TODAY
---

# Principal: $USER_NAME

## Role

${ROLE:-[Not yet specified — tell Claude about your role]}

## Communication Preferences

- **Length:** ${COMM_STYLE:-[Not yet specified]}
- **Style:** ${COMM_STYLE:-direct}
- **Frustrations:** ${FRUSTRATIONS:-[Not yet specified]}
- **What they value:** ${VALUES:-[Not yet specified]}

## Working Style

- ${WORK_STYLE:-[Not yet specified — describe how you like to work with AI]}
- Timezone: ${TIMEZONE:-[Not yet specified]}

## Corrections Log

Track corrections here so you never make the same mistake twice:

- (none yet — corrections will accumulate as you work together)
PRINCIPAL_EOF
    echo "  Updated: self/principal.md"
  fi

  echo ""
  echo "--- About Your Operator (the AI) ---"
  echo ""

  read -p "What should the operator focus on? (e.g., code, ops, research, everything): " OP_FOCUS
  read -p "What systems does the operator manage? (e.g., web servers, databases, CI/CD): " OP_SYSTEMS
  read -p "What APIs/services does it connect to? (e.g., GitHub, Slack, AWS): " OP_APIS
  read -p "What should the operator NEVER do? (e.g., push to prod, delete data): " OP_NEVER

  IDENTITY_FILE="$VAULT_DIR/self/identity.md"
  if [ -n "$OP_FOCUS" ]; then
    cat > "$IDENTITY_FILE" <<IDENTITY_EOF
---
title: Identity
description: Who I am in this partnership -- my role, style, and how I operate
type: self
created: $TODAY
---

# Identity

## My Role

I am ${USER_NAME}'s AI operator. I ${OP_FOCUS:-operate systems, write code, and think through problems}.

## How I Operate

- **Communication style:** ${COMM_STYLE:-concise and direct}
- **Decision-making:** I act on clear instructions, ask when uncertain
- **When uncertain:** I ask rather than guess

## Partnership Model

${USER_NAME} provides direction, priorities, and approvals. I provide execution, reasoning, and operational capacity. Neither of us runs this alone.

## What I Do Well

- ${OP_FOCUS:-General software engineering and system operation}

## What I'm Learning

- ${USER_NAME}'s preferences and patterns (improving every session)
IDENTITY_EOF
    echo "  Updated: self/identity.md"
  fi

  CAPABILITIES_FILE="$VAULT_DIR/self/capabilities.md"
  if [ -n "$OP_SYSTEMS" ] || [ -n "$OP_APIS" ] || [ -n "$OP_NEVER" ]; then
    cat > "$CAPABILITIES_FILE" <<CAPABILITIES_EOF
---
title: Capabilities
description: What I can do -- tools, access, APIs, and boundaries
type: self
created: $TODAY
---

# Capabilities

## Tools & Access

| Category | What I Can Do |
|----------|--------------|
| **Focus** | ${OP_FOCUS:-General development and operations} |
| **Systems** | ${OP_SYSTEMS:-[Add the systems you manage]} |
| **APIs** | ${OP_APIS:-[Add the services you connect to]} |

## What I Don't Do

- ${OP_NEVER:-[Add bright-line boundaries here]}

## Known Limitations

- Context window is finite — I work best with focused tasks
- I improve over time as corrections accumulate in the vault
CAPABILITIES_EOF
    echo "  Updated: self/capabilities.md"
  fi

  echo ""
  echo "  Identity setup complete! These files will be loaded into every session."
  echo "  Edit them anytime at: $VAULT_DIR/self/"
fi

# --- Done ---
echo ""
echo "=== Setup Complete ==="
echo ""
echo "What happens now:"
echo "  1. Open Claude Code in any directory"
echo "  2. The session-start hook will inject your vault context"
echo "  3. Start working — corrections and failures are auto-captured"
echo "  4. After a week, Claude will feel like it knows you"
echo ""
echo "Next steps:"
echo "  - Edit $VAULT_DIR/self/identity.md — tell Claude who you are"
echo "  - Edit $VAULT_DIR/self/principal.md — describe yourself and your preferences"
echo "  - Edit $GLOBAL_CLAUDE — add your principles and hard rules"
echo "  - Start the observatory: bun ~/.operatoros/observatory/server.ts"
echo "  - Configure collectors: edit ~/.operatoros/observatory/collectors/"
echo "  - Read templates/claude-md/layering-guide.md — understand the architecture"
echo ""
echo "The more you tell Claude, the better it gets. Every correction compounds."
