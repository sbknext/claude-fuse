/**
 * Detector: user_halt
 *
 * User message contains standalone halt/interrupt word.
 * Matches English: why / stop / wait
 * Matches Hindi loanwords: kyu / nahi / ruk  (bilingual support — real feature)
 * Regex: \b(kyu|why|stop|nahi|ruk|wait)\b  case-insensitive.
 * Severity: high.
 */

const HALT_RE = /\b(kyu|why|stop|nahi|ruk|wait)\b/i;

/**
 * @param {Array} events
 * @param {Object} session
 * @returns {Array}
 */
export function detect(events, session) {
  const mistakes = [];

  for (const event of events) {
    if (event.type !== 'user_msg') continue;
    const text = event.summary || '';
    if (HALT_RE.test(text)) {
      const match = text.match(HALT_RE);
      mistakes.push({
        session_id: session.id,
        event_id: event.id ?? null,
        pattern: 'user_halt',
        severity: 'high',
        details_json: JSON.stringify({
          trigger_word: match ? match[0] : null,
          message_summary: text.slice(0, 200),
          ts: event.ts,
        }),
        reviewed: 0,
        detected_at: Date.now(),
      });
    }
  }

  return mistakes;
}
