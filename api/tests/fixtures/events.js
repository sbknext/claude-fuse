/**
 * Synthetic event fixtures for detector and analyzer tests.
 */

export const SESSION = {
  id: 'test-session-001',
  user: 'sambhaji',
  project: 'brain',
  branch: 'master',
  cwd: '/Users/sam/brain',
  started_at: 1715260800000,
  status: 'active',
  source: 'test',
};

const T0 = 1715260800000;
const S = 1000; // 1 second

/** Helper to make an event */
export function mkEvent(overrides = {}) {
  return {
    id: null,
    session_id: SESSION.id,
    ts: T0,
    type: 'tool_use',
    tool_name: null,
    summary: '',
    duration_ms: 100,
    success: 1,
    jsonl_offset: null,
    ...overrides,
  };
}

// --- failed_bash_retry fixtures ---

export const failedBashRetryPositive = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Bash', success: 0, summary: 'npm run build' }),
  mkEvent({ id: 2, ts: T0 + 10 * S, tool_name: 'Bash', success: 1, summary: 'yarn install' }),
];

export const failedBashRetryNegative_tooSlow = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Bash', success: 0, summary: 'npm run build' }),
  // 90s later — beyond 60s window
  mkEvent({ id: 2, ts: T0 + 90 * S, tool_name: 'Bash', success: 1, summary: 'yarn install' }),
];

export const failedBashRetryNegative_similar = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Bash', success: 0, summary: 'npm run build --verbose' }),
  // Very similar command — Levenshtein ratio ≥ 0.3
  mkEvent({ id: 2, ts: T0 + 5 * S, tool_name: 'Bash', success: 1, summary: 'npm run build' }),
];

// --- edit_rollback fixtures ---

export const editRollbackPositive = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Edit', summary: 'Edit src/foo.js alpha bravo charlie delta echo foxtrot' }),
  // Same file within 120s, very different content
  mkEvent({ id: 2, ts: T0 + 30 * S, tool_name: 'Edit', summary: 'Edit src/foo.js xyz' }),
];

export const editRollbackNegative_differentFile = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Edit', summary: 'Edit src/foo.js alpha bravo charlie' }),
  mkEvent({ id: 2, ts: T0 + 30 * S, tool_name: 'Edit', summary: 'Edit src/bar.js xyz' }),
];

export const editRollbackNegative_tooSlow = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Edit', summary: 'Edit src/foo.js alpha bravo charlie' }),
  mkEvent({ id: 2, ts: T0 + 200 * S, tool_name: 'Edit', summary: 'Edit src/foo.js xyz' }),
];

// --- user_halt fixtures ---

export const kyuPositive = [
  mkEvent({ id: 1, ts: T0, type: 'user_msg', tool_name: null, summary: 'kyu aisa kar raha hai' }),
];

export const kyuPositive_stop = [
  mkEvent({ id: 1, ts: T0, type: 'user_msg', tool_name: null, summary: 'stop doing that please' }),
];

export const kyuPositive_why = [
  mkEvent({ id: 1, ts: T0, type: 'user_msg', tool_name: null, summary: 'why did you change it?' }),
];

export const kyuNegative_notUserMsg = [
  mkEvent({ id: 1, ts: T0, type: 'assistant_msg', tool_name: null, summary: 'kyu aisa' }),
];

export const kyuNegative_noKeyword = [
  mkEvent({ id: 1, ts: T0, type: 'user_msg', tool_name: null, summary: 'please continue with next step' }),
];

// --- panic_reset fixtures ---

const COMMIT_EVENT = mkEvent({ id: 10, ts: T0, tool_name: 'Bash', summary: 'git commit -m fix' });
const RESET_EVENT = mkEvent({ id: 11, ts: T0 + 2 * 60 * S, tool_name: 'Bash', summary: 'git reset --hard HEAD~1' });
const RESET_CHECKOUT = mkEvent({ id: 12, ts: T0 + 2 * 60 * S, tool_name: 'Bash', summary: 'git checkout .' });

export const panicResetPositive = [COMMIT_EVENT, RESET_EVENT];
export const panicResetPositive_checkout = [COMMIT_EVENT, RESET_CHECKOUT];

export const panicResetNegative_noCommit = [
  mkEvent({ id: 11, ts: T0, tool_name: 'Bash', summary: 'git reset --hard HEAD~1' }),
];

export const panicResetNegative_tooLate = [
  mkEvent({ id: 10, ts: T0, tool_name: 'Bash', summary: 'git commit -m fix' }),
  // More than 5 min later
  mkEvent({ id: 11, ts: T0 + 10 * 60 * S, tool_name: 'Bash', summary: 'git reset --hard HEAD~1' }),
];

// --- repeated_grep_read fixtures ---

export const repeatedGrepReadPositive = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Grep', summary: 'Grep src/utils.js' }),
  mkEvent({ id: 2, ts: T0 + 30 * S, tool_name: 'Read', summary: 'Read src/utils.js' }),
  mkEvent({ id: 3, ts: T0 + 60 * S, tool_name: 'Grep', summary: 'Grep src/utils.js' }),
];

export const repeatedGrepReadNegative_tooFew = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Grep', summary: 'Grep src/utils.js' }),
  mkEvent({ id: 2, ts: T0 + 30 * S, tool_name: 'Read', summary: 'Read src/utils.js' }),
];

export const repeatedGrepReadNegative_outsideWindow = [
  mkEvent({ id: 1, ts: T0, tool_name: 'Grep', summary: 'Grep src/utils.js' }),
  mkEvent({ id: 2, ts: T0 + 90 * S, tool_name: 'Read', summary: 'Read src/utils.js' }),
  // 3rd is outside 2min window from first
  mkEvent({ id: 3, ts: T0 + 180 * S, tool_name: 'Grep', summary: 'Grep src/utils.js' }),
];

// --- ngram tool sequences ---

export function makeToolSeqEvents(tools, baseTs = T0) {
  return tools.map((t, i) =>
    mkEvent({ id: i + 1, ts: baseTs + i * S, tool_name: t, type: 'tool_use' })
  );
}
