/**
 * Normalise a raw project path from the API into a readable short form.
 * - Real abs paths like "Users/sam/Documents/saas/swifter/frappe/bench"
 *   → last 2 segments: "frappe/bench"
 * - Already-short strings (≤20 chars, no slash) → pass through.
 */
export function normalizeProject(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = raw.trim();
  if (!s) return "—";

  // Detect real path: contains "Users/" or "/home/" or has 3+ slash-separated segments
  const segments = s.split("/").filter(Boolean);
  const looksLikePath =
    s.includes("Users/") ||
    s.includes("/home/") ||
    segments.length >= 3;

  if (looksLikePath && segments.length >= 2) {
    return segments.slice(-2).join("/");
  }

  return s;
}

/**
 * Compact number formatter.
 * ≥1M → "6.9M"  |  ≥1k → "25k"  |  else → raw
 */
export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/**
 * Parse details_json and return up to maxKeys key→value pairs,
 * values truncated to maxValueLen chars.
 */
export function parseDetailsJson(
  raw: string | null | undefined,
  maxKeys = 3,
  maxValueLen = 60
): Array<{ key: string; value: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return [{ key: "raw", value: String(raw).slice(0, maxValueLen) }];
    }
    return Object.entries(parsed)
      .slice(0, maxKeys)
      .map(([key, val]) => ({
        key,
        value: String(val).slice(0, maxValueLen),
      }));
  } catch {
    return [{ key: "raw", value: String(raw).slice(0, maxValueLen) }];
  }
}
