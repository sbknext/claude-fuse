/**
 * Skill N-gram Analyzer
 *
 * Sliding window 3..6-gram over event tool_name sequences.
 * Hashes to sha256 signature, upserts skill_candidates.
 * Threshold: freq ≥ 5 AND distinct sessions ≥ 3 → eligible for review.
 */
import { createHash } from 'crypto';

const MIN_N = 3;
const MAX_N = 6;
const FREQ_THRESHOLD = 5;
const SESSION_THRESHOLD = 3;

/**
 * Generate all n-grams of sizes MIN_N..MAX_N from an array.
 * @param {string[]} seq
 * @returns {Array<{n: number, gram: string[]}>}
 */
export function generateNgrams(seq) {
  const ngrams = [];
  for (let n = MIN_N; n <= MAX_N; n++) {
    for (let i = 0; i <= seq.length - n; i++) {
      ngrams.push({ n, gram: seq.slice(i, i + n) });
    }
  }
  return ngrams;
}

/**
 * Compute sha256 hex of the canonical gram string.
 */
export function gramSignature(gram) {
  return createHash('sha256').update(gram.join('|')).digest('hex');
}

/**
 * Upsert skill candidates into DB for a session's event sequence.
 *
 * @param {Object} db - better-sqlite3 instance
 * @param {string} sessionId
 * @param {Array} events - events for this session (already sorted by ts)
 */
export function analyzeSkillNgrams(db, sessionId, events) {
  // Extract tool names in order, skip non-tool events
  const toolSeq = events
    .filter((e) => e.tool_name)
    .map((e) => e.tool_name);

  if (toolSeq.length < MIN_N) return 0;

  const ngrams = generateNgrams(toolSeq);
  const now = Date.now();
  let touched = 0;

  const upsertStmt = db.prepare(`
    INSERT INTO skill_candidates
      (signature, tool_sequence_json, frequency, example_session_ids_json, first_seen, last_seen)
    VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(signature) DO UPDATE SET
      frequency = frequency + 1,
      last_seen = excluded.last_seen,
      example_session_ids_json = CASE
        WHEN instr(example_session_ids_json, excluded.example_session_ids_json) = 0
        THEN example_session_ids_json || ',' || excluded.example_session_ids_json
        ELSE example_session_ids_json
      END
  `);

  for (const { gram } of ngrams) {
    const sig = gramSignature(gram);
    upsertStmt.run(
      sig,
      JSON.stringify(gram),
      JSON.stringify([sessionId]),
      now,
      now
    );
    touched++;
  }

  return touched;
}

/**
 * Count distinct sessions from the comma-delimited example_session_ids_json.
 * Used by the API to filter candidates above threshold.
 */
export function distinctSessionCount(exampleSessionIdsJson) {
  if (!exampleSessionIdsJson) return 0;
  try {
    const parsed = JSON.parse(exampleSessionIdsJson);
    if (Array.isArray(parsed)) {
      return new Set(parsed.flatMap((s) => s.split(','))).size;
    }
    // Fallback: comma-separated string
    return new Set(exampleSessionIdsJson.split(',').map((s) => s.trim())).size;
  } catch {
    return new Set(exampleSessionIdsJson.split(',').map((s) => s.trim())).size;
  }
}

/**
 * Return skill candidates that meet promotion threshold.
 */
export function getEligibleCandidates(db) {
  const rows = db
    .prepare(
      `SELECT * FROM skill_candidates WHERE frequency >= ? AND promoted_at IS NULL`
    )
    .all(FREQ_THRESHOLD);

  return rows.filter(
    (r) => distinctSessionCount(r.example_session_ids_json) >= SESSION_THRESHOLD
  );
}

export { FREQ_THRESHOLD, SESSION_THRESHOLD };
