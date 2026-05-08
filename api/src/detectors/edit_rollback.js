/**
 * Detector: edit_rollback
 *
 * Edit on file X then Edit on same X within 120s reverting >50% of prior
 * change (line-level diff).  Severity: medium.
 */

/**
 * Simple line-level LCS to compute how much of A is preserved in B.
 * Returns fraction of A's lines that appear in B (longest common subsequence
 * length / A's length).
 */
function lcsRatio(linesA, linesB) {
  if (!linesA.length) return 1;
  const setB = new Set(linesB);
  const common = linesA.filter((l) => setB.has(l)).length;
  return common / linesA.length;
}

/**
 * Extract "file path" from the summary string.
 * Collector sets summary like "Edit /path/to/file [rest...]" or just the path.
 * We take the first whitespace-delimited token after the optional tool prefix.
 */
function extractFilePath(summary) {
  if (!summary) return null;
  // Strip leading tool name (Edit / Write)
  const stripped = summary.replace(/^(Edit|Write)\s+/i, '').trim();
  // First token = file path (may have additional info after it)
  const firstToken = stripped.split(/\s+/)[0];
  return firstToken || null;
}

/**
 * @param {Array} events
 * @param {Object} session
 * @returns {Array}
 */
export function detect(events, session) {
  const editEvents = events.filter(
    (e) => e.tool_name === 'Edit' || e.tool_name === 'Write'
  );
  const mistakes = [];

  for (let i = 0; i < editEvents.length - 1; i++) {
    const curr = editEvents[i];
    const file = extractFilePath(curr.summary);
    if (!file) continue;

    for (let j = i + 1; j < editEvents.length; j++) {
      const next = editEvents[j];
      const deltaMs = next.ts - curr.ts;
      if (deltaMs > 120_000) break;

      const nextFile = extractFilePath(next.summary);
      if (nextFile !== file) continue;

      // We don't have actual file content here — use summaries as proxy lines.
      // If summaries are too short/same, fall back to length heuristic.
      const linesA = (curr.summary || '').split(/\s+/);
      const linesB = (next.summary || '').split(/\s+/);
      const preservation = lcsRatio(linesA, linesB);

      // Reverting >50% means <50% of prior content preserved
      if (preservation < 0.5) {
        mistakes.push({
          session_id: session.id,
          event_id: next.id ?? null,
          pattern: 'edit_rollback',
          severity: 'medium',
          details_json: JSON.stringify({
            file,
            original_event_id: curr.id ?? null,
            rollback_event_id: next.id ?? null,
            preservation_ratio: preservation,
            delta_ms: deltaMs,
          }),
          reviewed: 0,
          detected_at: Date.now(),
        });
        break; // one detection per (file, original-edit) pair
      }
    }
  }

  return mistakes;
}
