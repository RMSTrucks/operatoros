#!/usr/bin/env bash
# OperatorOS Setup Script
#
# Sets up the memory vault, hooks, and CLAUDE.md templates.
# Run once to bootstrap. Everything is local, nothing phones home.
#
# Usage: bash setup.sh [--vault-dir DIR] [--name YOUR_NAME]

set -euo pipefail

# --- Defaults ---
VAULT_DIR=""
USER_NAME=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"
TODAY=$(date +%Y-%m-%d)

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-dir) VAULT_DIR="$2"; shift 2 ;;
    --name) USER_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: bash setup.sh [--vault-dir DIR] [--name YOUR_NAME]"
      echo ""
      echo "Options:"
      echo "  --vault-dir DIR    Where to create the memory vault (default: auto-detect)"
      echo "  --name NAME        Your name (used in templates)"
      echo ""
      echo "This script sets up:"
      echo "  1. Memory vault (self/, ops/, notes/ with templates)"
      echo "  2. Session hooks (session-start, session-end, capture-lessons)"
      echo "  3. CLAUDE.md templates (global + project)"
      echo "  4. Observatory (metrics collection + alerting framework)"
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

# --- Observatory ---
echo ""
echo "[5/5] Setting up Observatory..."

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
