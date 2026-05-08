/**
 * Detector: panic_reset
 *
 * Bash matching /git reset --hard/ OR /git checkout \./ within 5min of a
 * recent commit (Bash "git commit" event).
 * Severity: high.
 */

const PANIC_RE = /git\s+reset\s+--hard|git\s+checkout\s+\./;
const COMMIT_RE = /git\s+commit/;
const WINDOW_MS = 5 * 60_000; // 5 minutes

/**
 * @param {Array} events
 * @param {Object} session
 * @returns {Array}
 */
export function detect(events, session) {
  const bashEvents = events.filter((e) => e.tool_name === 'Bash');
  const mistakes = [];

  for (const event of bashEvents) {
    const summary = event.summary || '';
    if (!PANIC_RE.test(summary)) continue;

    // Look back up to WINDOW_MS for a git commit
    const recentCommit = bashEvents.find(
      (e) =>
        e.id !== event.id &&
        e.ts <= event.ts &&
        e.ts >= event.ts - WINDOW_MS &&
        COMMIT_RE.test(e.summary || '')
    );

    if (recentCommit) {
      mistakes.push({
        session_id: session.id,
        event_id: event.id ?? null,
        pattern: 'panic_reset',
        severity: 'high',
        details_json: JSON.stringify({
          reset_event_id: event.id ?? null,
          commit_event_id: recentCommit.id ?? null,
          delta_ms: event.ts - recentCommit.ts,
          reset_summary: summary,
          commit_summary: recentCommit.summary,
        }),
        reviewed: 0,
        detected_at: Date.now(),
      });
    }
  }

  return mistakes;
}
