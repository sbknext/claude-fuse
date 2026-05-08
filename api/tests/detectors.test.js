import { describe, it, expect } from 'vitest';
import { detect as detectFailedBash } from '../src/detectors/failed_bash_retry.js';
import { detect as detectEditRollback } from '../src/detectors/edit_rollback.js';
import { detect as detectUserHalt } from '../src/detectors/user_halt.js';
import { detect as detectPanic } from '../src/detectors/panic_reset.js';
import { detect as detectRepeat } from '../src/detectors/repeated_grep_read.js';
import {
  SESSION,
  failedBashRetryPositive,
  failedBashRetryNegative_tooSlow,
  failedBashRetryNegative_similar,
  editRollbackPositive,
  editRollbackNegative_differentFile,
  editRollbackNegative_tooSlow,
  kyuPositive,
  kyuPositive_stop,
  kyuPositive_why,
  kyuNegative_notUserMsg,
  kyuNegative_noKeyword,
  panicResetPositive,
  panicResetPositive_checkout,
  panicResetNegative_noCommit,
  panicResetNegative_tooLate,
  repeatedGrepReadPositive,
  repeatedGrepReadNegative_tooFew,
  repeatedGrepReadNegative_outsideWindow,
} from './fixtures/events.js';

// ─── failed_bash_retry ────────────────────────────────────────────────────────

describe('failed_bash_retry', () => {
  it('detects failed bash followed by quick dissimilar retry', () => {
    const results = detectFailedBash(failedBashRetryPositive, SESSION);
    expect(results).toHaveLength(1);
    expect(results[0].pattern).toBe('failed_bash_retry');
    expect(results[0].severity).toBe('medium');
    expect(results[0].session_id).toBe(SESSION.id);
  });

  it('misses retry outside 60s window', () => {
    const results = detectFailedBash(failedBashRetryNegative_tooSlow, SESSION);
    expect(results).toHaveLength(0);
  });

  it('misses retry with similar command (ratio >= 0.3)', () => {
    const results = detectFailedBash(failedBashRetryNegative_similar, SESSION);
    expect(results).toHaveLength(0);
  });

  it('returns empty array on no events', () => {
    expect(detectFailedBash([], SESSION)).toEqual([]);
  });

  it('returns empty when no failed events', () => {
    const events = [
      { id: 1, ts: 1000, tool_name: 'Bash', success: 1, summary: 'npm test' },
      { id: 2, ts: 2000, tool_name: 'Bash', success: 1, summary: 'npm build' },
    ];
    expect(detectFailedBash(events, SESSION)).toHaveLength(0);
  });
});

// ─── edit_rollback ────────────────────────────────────────────────────────────

describe('edit_rollback', () => {
  it('detects rollback on same file within 120s', () => {
    const results = detectEditRollback(editRollbackPositive, SESSION);
    expect(results).toHaveLength(1);
    expect(results[0].pattern).toBe('edit_rollback');
    expect(results[0].severity).toBe('medium');
  });

  it('misses edit on different file', () => {
    const results = detectEditRollback(editRollbackNegative_differentFile, SESSION);
    expect(results).toHaveLength(0);
  });

  it('misses edit outside 120s window', () => {
    const results = detectEditRollback(editRollbackNegative_tooSlow, SESSION);
    expect(results).toHaveLength(0);
  });

  it('returns empty array on no events', () => {
    expect(detectEditRollback([], SESSION)).toEqual([]);
  });
});

// ─── user_halt ────────────────────────────────────────────────────────────────

describe('user_halt', () => {
  it('detects "kyu" in user message', () => {
    const results = detectUserHalt(kyuPositive, SESSION);
    expect(results).toHaveLength(1);
    expect(results[0].pattern).toBe('user_halt');
    expect(results[0].severity).toBe('high');
  });

  it('detects "stop" in user message', () => {
    const results = detectUserHalt(kyuPositive_stop, SESSION);
    expect(results).toHaveLength(1);
  });

  it('detects "why" in user message', () => {
    const results = detectUserHalt(kyuPositive_why, SESSION);
    expect(results).toHaveLength(1);
  });

  it('ignores same word in non-user_msg event', () => {
    const results = detectUserHalt(kyuNegative_notUserMsg, SESSION);
    expect(results).toHaveLength(0);
  });

  it('ignores user message without trigger word', () => {
    const results = detectUserHalt(kyuNegative_noKeyword, SESSION);
    expect(results).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const ev = [{ id: 1, ts: 1000, type: 'user_msg', tool_name: null, summary: 'WHY are you doing this', session_id: SESSION.id }];
    expect(detectUserHalt(ev, SESSION)).toHaveLength(1);
  });

  it('matches "wait" as trigger', () => {
    const ev = [{ id: 1, ts: 1000, type: 'user_msg', tool_name: null, summary: 'wait a moment', session_id: SESSION.id }];
    expect(detectUserHalt(ev, SESSION)).toHaveLength(1);
  });

  it('returns empty on empty events', () => {
    expect(detectUserHalt([], SESSION)).toEqual([]);
  });
});

// ─── panic_reset ──────────────────────────────────────────────────────────────

describe('panic_reset', () => {
  it('detects git reset --hard within 5min of commit', () => {
    const results = detectPanic(panicResetPositive, SESSION);
    expect(results).toHaveLength(1);
    expect(results[0].pattern).toBe('panic_reset');
    expect(results[0].severity).toBe('high');
  });

  it('detects git checkout . within 5min of commit', () => {
    const results = detectPanic(panicResetPositive_checkout, SESSION);
    expect(results).toHaveLength(1);
  });

  it('misses reset without prior commit', () => {
    const results = detectPanic(panicResetNegative_noCommit, SESSION);
    expect(results).toHaveLength(0);
  });

  it('misses reset more than 5min after commit', () => {
    const results = detectPanic(panicResetNegative_tooLate, SESSION);
    expect(results).toHaveLength(0);
  });

  it('returns empty on no events', () => {
    expect(detectPanic([], SESSION)).toEqual([]);
  });
});

// ─── repeated_grep_read ───────────────────────────────────────────────────────

describe('repeated_grep_read', () => {
  it('detects 3+ Grep/Read on same file within 2min', () => {
    const results = detectRepeat(repeatedGrepReadPositive, SESSION);
    expect(results).toHaveLength(1);
    expect(results[0].pattern).toBe('repeated_grep_read');
    expect(results[0].severity).toBe('low');
  });

  it('misses when only 2 accesses', () => {
    const results = detectRepeat(repeatedGrepReadNegative_tooFew, SESSION);
    expect(results).toHaveLength(0);
  });

  it('misses when 3rd access is outside 2min window', () => {
    const results = detectRepeat(repeatedGrepReadNegative_outsideWindow, SESSION);
    // Only first two are within window — not enough
    expect(results).toHaveLength(0);
  });

  it('returns empty on no events', () => {
    expect(detectRepeat([], SESSION)).toEqual([]);
  });

  it('returns empty when no Grep/Read events', () => {
    const events = [
      { id: 1, ts: 1000, tool_name: 'Bash', summary: 'ls -la', session_id: SESSION.id },
    ];
    expect(detectRepeat(events, SESSION)).toHaveLength(0);
  });
});
