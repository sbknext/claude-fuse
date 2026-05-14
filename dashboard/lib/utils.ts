/**
 * Format epoch ms as relative time ("5 min ago", "2 hr ago", etc.)
 */
export function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const seconds = Math.round(diff / 1000);
  if (Math.abs(seconds) < 60) return rtf.format(-seconds, "second");

  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");

  const hours = Math.round(diff / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");

  const days = Math.round(diff / 86_400_000);
  return rtf.format(-days, "day");
}

/**
 * Format epoch ms as ISO-like date string "YYYY-MM-DD HH:MM"
 */
export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Short date+time for table cells. Today/yesterday → time only.
 * Older → "MMM DD HH:MM" (e.g. "May 11 14:30").
 */
export function shortDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (sameDay) return `today ${time}`;
  if (isYesterday) return `yest ${time}`;
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${md} ${time}`;
}

/**
 * Short session id (first 8 chars)
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export const SEVERITY_COLORS: Record<string, string> = {
  high: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  medium:
    "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
  low: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
};
