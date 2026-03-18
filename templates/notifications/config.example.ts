/**
 * Notification Configuration — example setup.
 *
 * Copy this file to config.ts and customize for your environment.
 * The scanner imports this to know how to send notifications.
 */

import { createNotifier } from "./notify";
import { createTelegramChannel } from "./channels/telegram";
import { createSlackChannel } from "./channels/slack";
import { createDesktopChannel } from "./channels/desktop";

// Create the notifier with your channels and routing rules
export const notifier = createNotifier({
  channels: [
    // Telegram — reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from env
    createTelegramChannel(),

    // Slack — reads SLACK_WEBHOOK_URL from env
    // createSlackChannel(),

    // Desktop — uses native OS notifications
    createDesktopChannel(),
  ],

  routes: [
    // Critical alerts → Telegram immediately
    { severities: ["critical"], channel: "telegram" },

    // Warnings → desktop notification
    { severities: ["warning"], channel: "desktop" },

    // Info → desktop (optional, you might want to skip these)
    // { severities: ["info"], channel: "desktop" },

    // Route specific sources to specific channels
    // { severities: ["critical", "warning"], channel: "slack", source: "observatory" },
  ],

  // Don't send the same notification more than once per hour
  dedup_cooldown_seconds: 3600,

  // Max 10 notifications per channel per hour
  rate_limit_per_hour: 10,
});
