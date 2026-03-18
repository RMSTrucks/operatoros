/**
 * Notification Engine — routes notifications through channels based on severity.
 *
 * Features:
 *   - Pluggable channel adapters (Telegram, Slack, desktop, etc.)
 *   - Severity-based routing with configurable rules
 *   - Fingerprint dedup to prevent alert storms
 *   - Per-channel rate limiting
 *
 * Usage:
 *   import { createNotifier } from "./notify";
 *   import { createTelegramChannel } from "./channels/telegram";
 *
 *   const notifier = createNotifier({
 *     channels: [createTelegramChannel({ botToken: "...", chatId: "..." })],
 *     routes: [
 *       { severities: ["critical", "warning"], channel: "telegram" },
 *     ],
 *     dedup_cooldown_seconds: 3600,
 *     rate_limit_per_hour: 10,
 *   });
 *
 *   await notifier.send({ type: "alert", severity: "critical", source: "obs", message: "..." });
 */

import type {
  Notification,
  NotificationChannel,
  NotifyConfig,
  RoutingRule,
  Severity,
} from "./types";

// ---------------------------------------------------------------------------
// Dedup + rate limiting state
// ---------------------------------------------------------------------------

interface DedupEntry {
  fingerprint: string;
  last_sent: number;
}

interface RateLimitEntry {
  channel: string;
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface Notifier {
  /** Send a notification through the routing engine. */
  send(notification: Notification): Promise<void>;
  /** Convenience: send a critical notification. */
  critical(type: string, source: string, message: string): Promise<void>;
  /** Convenience: send a warning notification. */
  warning(type: string, source: string, message: string): Promise<void>;
  /** Convenience: send an info notification. */
  info(type: string, source: string, message: string): Promise<void>;
}

export function createNotifier(config: NotifyConfig): Notifier {
  const channelMap = new Map<string, NotificationChannel>();
  for (const ch of config.channels) {
    channelMap.set(ch.name, ch);
  }

  const dedupCache = new Map<string, number>(); // fingerprint -> last_sent_ms
  const rateLog = new Map<string, number[]>(); // channel -> timestamps

  const cooldownMs = (config.dedup_cooldown_seconds || 3600) * 1000;
  const maxPerHour = config.rate_limit_per_hour || 10;

  function getFingerprint(n: Notification): string {
    return n.fingerprint || `${n.type}:${n.source}:${n.message.slice(0, 80)}`;
  }

  function isDuplicate(fingerprint: string): boolean {
    const lastSent = dedupCache.get(fingerprint);
    if (!lastSent) return false;
    return Date.now() - lastSent < cooldownMs;
  }

  function isRateLimited(channel: string): boolean {
    const timestamps = rateLog.get(channel) || [];
    const oneHourAgo = Date.now() - 3_600_000;
    const recent = timestamps.filter((t) => t > oneHourAgo);
    rateLog.set(channel, recent);
    return recent.length >= maxPerHour;
  }

  function recordSend(fingerprint: string, channel: string): void {
    dedupCache.set(fingerprint, Date.now());
    const timestamps = rateLog.get(channel) || [];
    timestamps.push(Date.now());
    rateLog.set(channel, timestamps);

    // Periodic cleanup
    if (dedupCache.size > 500) {
      const cutoff = Date.now() - cooldownMs;
      for (const [key, ts] of dedupCache) {
        if (ts < cutoff) dedupCache.delete(key);
      }
    }
  }

  function findRoute(notification: Notification): RoutingRule | undefined {
    for (const rule of config.routes) {
      // Check severity
      if (!rule.severities.includes(notification.severity)) continue;
      // Check source filter
      if (rule.source && rule.source !== notification.source) continue;
      // Check type pattern
      if (rule.type_pattern) {
        try {
          if (!new RegExp(rule.type_pattern).test(notification.type)) continue;
        } catch {
          continue;
        }
      }
      return rule;
    }
    return undefined;
  }

  async function send(notification: Notification): Promise<void> {
    const fingerprint = getFingerprint(notification);

    // Dedup
    if (isDuplicate(fingerprint)) {
      return;
    }

    // Route
    const route = findRoute(notification);
    if (!route) {
      // No route matched — noise level, just skip
      return;
    }

    // Get channel
    const channel = channelMap.get(route.channel);
    if (!channel) {
      console.warn(`[notify] Channel "${route.channel}" not found — skipping`);
      return;
    }

    // Rate limit
    if (isRateLimited(route.channel)) {
      console.warn(`[notify] Channel "${route.channel}" rate limited — skipping`);
      return;
    }

    // Send
    try {
      await channel.send(notification);
      recordSend(fingerprint, route.channel);
    } catch (err) {
      console.error(`[notify] Failed to send via ${route.channel}: ${err}`);
    }
  }

  return {
    send,
    critical: (type, source, message) =>
      send({ type, severity: "critical", source, message }),
    warning: (type, source, message) =>
      send({ type, severity: "warning", source, message }),
    info: (type, source, message) =>
      send({ type, severity: "info", source, message }),
  };
}
