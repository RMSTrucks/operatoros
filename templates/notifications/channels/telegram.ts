/**
 * Telegram Channel — sends notifications via Telegram Bot API.
 *
 * Config:
 *   TELEGRAM_BOT_TOKEN — your bot token from @BotFather
 *   TELEGRAM_CHAT_ID   — the chat ID to send to
 *
 * These can be passed as options or read from environment variables.
 */

import type { Notification, NotificationChannel } from "../types";

interface TelegramOptions {
  botToken?: string;
  chatId?: string;
  /** Parse mode: "HTML" or "MarkdownV2" (default: "HTML"). */
  parseMode?: "HTML" | "MarkdownV2";
}

function formatMessage(n: Notification): string {
  const severity = n.severity.toUpperCase();
  const header = `<b>[${severity}] ${n.type}</b>`;
  const source = n.source ? `\n<i>Source: ${n.source}</i>` : "";
  return `${header}${source}\n\n${n.message}`;
}

export function createTelegramChannel(options: TelegramOptions = {}): NotificationChannel {
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = options.chatId || process.env.TELEGRAM_CHAT_ID || "";
  const parseMode = options.parseMode || "HTML";

  return {
    name: "telegram",

    async send(notification: Notification): Promise<void> {
      if (!botToken || !chatId) {
        console.warn("[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — skipping");
        return;
      }

      const text = formatMessage(notification);

      // Telegram max message length is 4096 chars
      const trimmed = text.length > 4000 ? text.slice(0, 3997) + "..." : text;

      try {
        const resp = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: trimmed,
              parse_mode: parseMode,
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (!resp.ok) {
          const body = await resp.text();
          console.error(`[telegram] Send failed (${resp.status}): ${body}`);
        }
      } catch (err) {
        console.error(`[telegram] Send error: ${err}`);
      }
    },
  };
}
