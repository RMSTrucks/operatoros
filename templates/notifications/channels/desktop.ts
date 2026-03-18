/**
 * Desktop Channel — sends notifications via OS-native notification system.
 *
 * Linux: uses notify-send (libnotify)
 * macOS: uses osascript (AppleScript)
 *
 * No configuration needed — works if the tools are installed.
 */

import { execSync } from "node:child_process";
import { platform } from "node:os";
import type { Notification, NotificationChannel } from "../types";

const URGENCY_MAP: Record<string, string> = {
  critical: "critical",
  warning: "normal",
  info: "low",
  noise: "low",
};

function escapeShell(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function sendLinux(title: string, body: string, urgency: string): void {
  try {
    execSync(
      `notify-send --urgency=${urgency} '${escapeShell(title)}' '${escapeShell(body)}'`,
      { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch {
    console.warn("[desktop] notify-send failed — is libnotify installed?");
  }
}

function sendMacOS(title: string, body: string): void {
  try {
    execSync(
      `osascript -e 'display notification "${escapeShell(body)}" with title "${escapeShell(title)}"'`,
      { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch {
    console.warn("[desktop] osascript failed");
  }
}

export function createDesktopChannel(): NotificationChannel {
  const os = platform();

  return {
    name: "desktop",

    async send(notification: Notification): Promise<void> {
      const title = `[${notification.severity.toUpperCase()}] ${notification.type}`;
      // Truncate body for desktop notifications
      const body =
        notification.message.length > 200
          ? notification.message.slice(0, 197) + "..."
          : notification.message;

      if (os === "linux") {
        const urgency = URGENCY_MAP[notification.severity] || "normal";
        sendLinux(title, body, urgency);
      } else if (os === "darwin") {
        sendMacOS(title, body);
      } else {
        console.warn(`[desktop] Unsupported platform: ${os}`);
      }
    },
  };
}
