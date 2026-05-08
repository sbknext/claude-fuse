/**
 * Detector registry + runner.
 * Each detector: detect(events, session) → Array<mistakeRow>
 */
import { detect as failedBashRetry } from './failed_bash_retry.js';
import { detect as editRollback } from './edit_rollback.js';
import { detect as userHalt } from './user_halt.js';
import { detect as panicReset } from './panic_reset.js';
import { detect as repeatedGrepRead } from './repeated_grep_read.js';

const DETECTORS = [
  failedBashRetry,
  editRollback,
  userHalt,
  panicReset,
  repeatedGrepRead,
];

/**
 * Run all detectors over events for a session.
 * @param {Array} events  - event rows from DB for the session
 * @param {Object} session - session row
 * @returns {Array} flat array of mistake rows ready for DB insert
 */
export function runAllDetectors(events, session) {
  const results = [];
  for (const detector of DETECTORS) {
    try {
      const found = detector(events, session);
      if (Array.isArray(found)) results.push(...found);
    } catch (err) {
      console.error(`[detector] error in ${detector.name}:`, err.message);
    }
  }
  return results;
}
