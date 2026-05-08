/**
 * Detector: failed_bash_retry
 *
 * Bash exit≠0 followed by another Bash within 60s with Levenshtein ratio <0.3
 * vs prior command.  Severity: medium.
 */
import { distance } from 'fastest-levenshtein';

function levenshteinRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

/**
 * @param {Array} events  - array of event rows (already for this session)
 * @param {Object} session - session row
 * @returns {Array} mistake rows (without id/detected_at — caller fills those)
 */
export function detect(events, session) {
  const bashEvents = events.filter((e) => e.tool_name === 'Bash');
  const mistakes = [];

  for (let i = 0; i < bashEvents.length - 1; i++) {
    const curr = bashEvents[i];
    const next = bashEvents[i + 1];

    // Failed bash (success === 0 or success === false)
    if (curr.success !== 0 && curr.success !== false) continue;

    const deltaMs = next.ts - curr.ts;
    if (deltaMs > 60_000) continue;

    const ratio = levenshteinRatio(curr.summary || '', next.summary || '');
    if (ratio < 0.3) {
      mistakes.push({
        session_id: session.id,
        event_id: next.id ?? null,
        pattern: 'failed_bash_retry',
        severity: 'medium',
        details_json: JSON.stringify({
          failed_event_id: curr.id ?? null,
          retry_event_id: next.id ?? null,
          levenshtein_ratio: ratio,
          delta_ms: deltaMs,
          failed_summary: curr.summary,
          retry_summary: next.summary,
        }),
        reviewed: 0,
        detected_at: Date.now(),
      });
    }
  }

  return mistakes;
}
