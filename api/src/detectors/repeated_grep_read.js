/**
 * Detector: repeated_grep_read
 *
 * 3+ Grep or Read calls on the same file within 2 minutes.
 * Severity: low.
 */

const WINDOW_MS = 2 * 60_000; // 2 minutes

/**
 * Extract the file target from a Grep/Read event summary.
 * Collector typically sets summary to the file path or "Grep <pattern> <file>".
 */
function extractTarget(event) {
  const s = event.summary || '';
  // Strip leading tool name
  return s.replace(/^(Grep|Read)\s+/i, '').trim() || s;
}

/**
 * @param {Array} events
 * @param {Object} session
 * @returns {Array}
 */
export function detect(events, session) {
  const grepRead = events.filter(
    (e) => e.tool_name === 'Grep' || e.tool_name === 'Read'
  );
  const mistakes = [];
  const reportedFiles = new Set(); // one detection per unique file per session

  for (let i = 0; i < grepRead.length; i++) {
    const anchor = grepRead[i];
    const file = extractTarget(anchor);
    if (!file) continue;

    // Already reported a detection for this file in this session
    if (reportedFiles.has(file)) continue;

    // Collect all events on same file within 2min of anchor
    const group = grepRead.filter(
      (e) =>
        extractTarget(e) === file &&
        e.ts >= anchor.ts &&
        e.ts - anchor.ts <= WINDOW_MS
    );

    if (group.length >= 3) {
      reportedFiles.add(file);
      mistakes.push({
        session_id: session.id,
        event_id: anchor.id ?? null,
        pattern: 'repeated_grep_read',
        severity: 'low',
        details_json: JSON.stringify({
          file,
          count: group.length,
          event_ids: group.map((e) => e.id ?? null),
          window_start: anchor.ts,
          window_end: group[group.length - 1].ts,
        }),
        reviewed: 0,
        detected_at: Date.now(),
      });
    }
  }

  return mistakes;
}
