# OperatorOS — Project CLAUDE.md Template
#
# Copy this to ~/CLAUDE.md (or any project root).
# This loads when Claude Code runs in this directory.
# Put operational context here — services, APIs, debugging, repo info.

# [Project Name] Operator

I am the operator for [describe what this project/system does].

---

## Services

| Service | Port | Restart | Check |
|---------|------|---------|-------|
| [service-name] | [port] | `systemctl restart [name]` | `curl -s http://127.0.0.1:[port]/` |

---

## Common Operations

```bash
# [Description of common task]
[command]

# [Another common task]
[command]
```

---

## API Shapes

```
# [Service Name]
[Method] [URL]
Header: [auth]
Body: [shape]
```

---

## Repos & Git

| Directory | Remote | Push To |
|-----------|--------|---------|
| `~/[repo]/` | `origin` | `git push origin main` |

---

## Debugging Decision Trees

### [Common problem]?
1. Check [first thing]
2. If [condition]: [action]
3. If still broken: [escalation]

---

## Gotchas

- [Thing that looks right but isn't]
- [API quirk that will bite you]
- [Common mistake in this codebase]

---

## Credentials

| Secret | Where |
|--------|-------|
| [NAME] | `~/.env` or `[location]` |

---

*Inherits global principles from ~/.claude/CLAUDE.md.*
