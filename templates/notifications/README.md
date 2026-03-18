# Notifications

Multi-channel notification system for OperatorOS. Routes alerts through pluggable channels based on severity.

## Architecture

```
Notification (type, severity, source, message)
    |
    v
Routing Engine → finds matching rule by severity/source/type
    |
    v
Channel Adapter → delivers via Telegram, Slack, desktop, etc.
    |
    ├─ Dedup: same fingerprint suppressed within cooldown
    └─ Rate limit: max N per channel per hour
```

## Quick Start

```typescript
import { createNotifier } from "./notify";
import { createTelegramChannel } from "./channels/telegram";
import { createDesktopChannel } from "./channels/desktop";

const notifier = createNotifier({
  channels: [
    createTelegramChannel(), // reads TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID from env
    createDesktopChannel(),
  ],
  routes: [
    { severities: ["critical"], channel: "telegram" },
    { severities: ["warning"], channel: "desktop" },
  ],
  dedup_cooldown_seconds: 3600,
  rate_limit_per_hour: 10,
});

// Send notifications
await notifier.critical("disk_full", "system", "Disk usage at 95%");
await notifier.warning("slow_response", "api", "Response time 3.2s");
await notifier.info("scan_complete", "observatory", "All 5 collectors OK");
```

## Built-in Channels

| Channel | Env Vars | Platform |
|---------|----------|----------|
| `telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Any |
| `slack` | `SLACK_WEBHOOK_URL` | Any |
| `desktop` | None | Linux (notify-send), macOS (osascript) |

## Adding a Channel

Implement the `NotificationChannel` interface:

```typescript
// channels/my-channel.ts
import type { Notification, NotificationChannel } from "../types";

export function createMyChannel(): NotificationChannel {
  return {
    name: "my-channel",
    async send(notification: Notification): Promise<void> {
      // Deliver the notification
      console.log(`[my-channel] ${notification.severity}: ${notification.message}`);
    },
  };
}
```

Then register it in your config:

```typescript
const notifier = createNotifier({
  channels: [createMyChannel()],
  routes: [{ severities: ["critical"], channel: "my-channel" }],
  // ...
});
```

## Routing Rules

Rules are evaluated in order — first match wins:

```typescript
routes: [
  // Specific: observatory criticals go to Telegram
  { severities: ["critical"], channel: "telegram", source: "observatory" },

  // Specific: scan_* events go to Slack
  { severities: ["warning"], channel: "slack", type_pattern: "scan_.*" },

  // Catch-all: everything else to desktop
  { severities: ["critical", "warning", "info"], channel: "desktop" },
]
```

## Integration with Observatory

The scanner can use notifications for alert delivery. In your scanner config:

```typescript
import { notifier } from "../notifications/config";

// After alert evaluation:
for (const alert of triggeredAlerts) {
  await notifier.send({
    type: `alert.${alert.rule_name}`,
    severity: alert.severity as Severity,
    source: "observatory",
    message: alert.message,
    fingerprint: `alert:${alert.rule_name}`,
  });
}
```

## Severity Levels

| Level | Meaning | Typical Route |
|-------|---------|---------------|
| `critical` | Needs attention now | Telegram, SMS |
| `warning` | Should investigate soon | Desktop, Slack |
| `info` | FYI, no action needed | Desktop, log |
| `noise` | Suppressed entirely | Log only |
