/**
 * Slack Channel — sends notifications via Slack Incoming Webhook.
 *
 * Config:
 *   SLACK_WEBHOOK_URL — your Slack webhook URL
 *
 * Set up a webhook at https://api.slack.com/messaging/webhooks
 */

import type { Notification, NotificationChannel } from "../types";

interface SlackOptions {
  webhookUrl?: string;
  /** Channel override (optional — uses webhook default). */
  channel?: string;
  /** Username override (optional). */
  username?: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ":rotating_light:",
  warning: ":warning:",
  info: ":information_source:",
  noise: ":speaker:",
};

function formatMessage(n: Notification): string {
  const emoji = SEVERITY_EMOJI[n.severity] || ":bell:";
  return `${emoji} *[${n.severity.toUpperCase()}] ${n.type}*\n_Source: ${n.source}_\n\n${n.message}`;
}

export function createSlackChannel(options: SlackOptions = {}): NotificationChannel {
  const webhookUrl = options.webhookUrl || process.env.SLACK_WEBHOOK_URL || "";

  return {
    name: "slack",

    async send(notification: Notification): Promise<void> {
      if (!webhookUrl) {
        console.warn("[slack] Missing SLACK_WEBHOOK_URL — skipping");
        return;
      }

      const text = formatMessage(notification);

      const payload: Record<string, unknown> = { text };
      if (options.channel) payload.channel = options.channel;
      if (options.username) payload.username = options.username;

      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });

        if (!resp.ok) {
          const body = await resp.text();
          console.error(`[slack] Send failed (${resp.status}): ${body}`);
        }
      } catch (err) {
        console.error(`[slack] Send error: ${err}`);
      }
    },
  };
}
