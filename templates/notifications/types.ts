/**
 * Notification Types — core type definitions for the notification system.
 */

/** Severity levels, in order of urgency. */
export type Severity = "critical" | "warning" | "info" | "noise";

/** A notification to deliver. */
export interface Notification {
  /** Event type identifier (e.g., "alert_fired", "scan_complete"). */
  type: string;
  /** Urgency level — determines routing. */
  severity: Severity;
  /** Where it came from (e.g., "observatory", "scanner"). */
  source: string;
  /** Human-readable message. */
  message: string;
  /** Dedup key — notifications with the same fingerprint are suppressed within cooldown. */
  fingerprint?: string;
  /** Extra data for channel-specific formatting. */
  metadata?: Record<string, unknown>;
}

/** Channel adapter interface — implement this to add a new delivery channel. */
export interface NotificationChannel {
  /** Channel name (e.g., "telegram", "slack", "desktop"). */
  name: string;
  /** Deliver a notification. Should not throw — log errors internally. */
  send(notification: Notification): Promise<void>;
}

/** Routing rule — maps severity levels to channels. */
export interface RoutingRule {
  /** Severity levels this rule applies to. */
  severities: Severity[];
  /** Channel name to deliver to. */
  channel: string;
  /** Optional: only match notifications with this source. */
  source?: string;
  /** Optional: only match notifications with this type pattern (regex). */
  type_pattern?: string;
}

/** Configuration for the notification engine. */
export interface NotifyConfig {
  /** Registered channel adapters. */
  channels: NotificationChannel[];
  /** Routing rules (evaluated in order, first match wins). */
  routes: RoutingRule[];
  /** Global cooldown in seconds between duplicate notifications (default: 3600). */
  dedup_cooldown_seconds: number;
  /** Max notifications per channel per hour (default: 10). */
  rate_limit_per_hour: number;
}
