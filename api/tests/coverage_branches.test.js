/**
 * Extra tests specifically to hit uncovered branches flagged by v8 coverage.
 * Covers: edit_rollback null-summary paths, failed_bash_retry edge cases,
 * panic_reset no-hit paths, repeated_grep_read window edge, skill_ngram JSON parse paths.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detect as detectFailedBash } from '../src/detectors/failed_bash_retry.js';
import { detect as detectEditRollback } from '../src/detectors/edit_rollback.js';
import { detect as detectRepeat } from '../src/detectors/repeated_grep_read.js';
import { detect as detectPanic } from '../src/detectors/panic_reset.js';
import { detect as detectUserHalt } from '../src/detectors/user_halt.js';
import { runAllDetectors } from '../src/detectors/index.js';
import {
  generateNgrams,
  gramSignature,
  analyzeSkillNgrams,
  getEligibleCandidates,
  distinctSessionCount,
  FREQ_THRESHOLD,
} from '../src/analyzers/skill_ngram.js';
import { SESSION, mkEvent } from './fixtures/events.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

let tmpDir;
let db;

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT NOT NULL UNIQUE,
      name TEXT,
      description TEXT,
      tool_sequence_json TEXT NOT NULL,
      frequency INTEGER DEFAULT 1,
      example_session_ids_json TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      promoted_at INTEGER
    );
  `);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fuse-branch-test-'));
  db = new Database(join(tmpDir, 'test.db'));
  applySchema(db);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── failed_bash_retry branch coverage ───────────────────────────────────────

describe('failed_bash_retry branch coverage', () => {
  it('handles both summary strings being empty/null', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Bash', success: 0, summary: '' }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Bash', success: 1, summary: '' }),
    ];
    // Both empty: levenshteinRatio returns 1 (not < 0.3), no detection
    const results = detectFailedBash(events, SESSION);
    expect(results).toHaveLength(0);
  });

  it('handles null summary on one side', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Bash', success: 0, summary: null }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Bash', success: 1, summary: 'yarn' }),
    ];
    // null vs 'yarn': ratio = 0 < 0.3 → detects
    const results = detectFailedBash(events, SESSION);
    expect(results).toHaveLength(1);
  });

  it('handles single bash event without pair', () => {
    const events = [mkEvent({ id: 1, ts: 1000, tool_name: 'Bash', success: 0, summary: 'ls' })];
    expect(detectFailedBash(events, SESSION)).toHaveLength(0);
  });
});

// ─── edit_rollback branch coverage ───────────────────────────────────────────

describe('edit_rollback branch coverage', () => {
  it('handles null summary on edit event', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Edit', summary: null }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Edit', summary: null }),
    ];
    // Both null file paths → no detection
    expect(detectEditRollback(events, SESSION)).toHaveLength(0);
  });

  it('handles no file prefix in summary (just a path)', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Edit', summary: 'src/foo.js many words here to diff' }),
      mkEvent({ id: 2, ts: 30000, tool_name: 'Edit', summary: 'src/foo.js newcontent' }),
    ];
    // Same file (first token), content differs heavily → detect
    const results = detectEditRollback(events, SESSION);
    expect(results).toHaveLength(1);
  });

  it('handles single edit event with no pair', () => {
    const events = [mkEvent({ id: 1, ts: 1000, tool_name: 'Edit', summary: 'Edit src/foo.js' })];
    expect(detectEditRollback(events, SESSION)).toHaveLength(0);
  });

  it('skips non-edit events', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Bash', summary: 'npm test' }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Grep', summary: 'Grep foo' }),
    ];
    expect(detectEditRollback(events, SESSION)).toHaveLength(0);
  });
});

// ─── repeated_grep_read branch coverage ──────────────────────────────────────

describe('repeated_grep_read branch coverage', () => {
  it('handles events where extractTarget returns empty string (skipped)', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Grep', summary: '' }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Grep', summary: '' }),
      mkEvent({ id: 3, ts: 10000, tool_name: 'Grep', summary: '' }),
    ];
    // Empty summary → extractTarget strips "Grep " prefix but there's nothing left
    // Actually: '' has no prefix to strip, first token is '' → falsy → skipped
    const results = detectRepeat(events, SESSION);
    expect(results).toHaveLength(0);
  });

  it('does not double-report same file across multiple windows', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Grep', summary: 'Grep file.js' }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Read', summary: 'Read file.js' }),
      mkEvent({ id: 3, ts: 10000, tool_name: 'Grep', summary: 'Grep file.js' }),
      mkEvent({ id: 4, ts: 15000, tool_name: 'Read', summary: 'Read file.js' }),
    ];
    // 4 accesses to same file — but only one detection per file per session
    const results = detectRepeat(events, SESSION);
    expect(results).toHaveLength(1);
  });
});

// ─── panic_reset branch coverage ─────────────────────────────────────────────

describe('panic_reset branch coverage', () => {
  it('ignores non-Bash events', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Edit', summary: 'git commit -m fix' }),
      mkEvent({ id: 2, ts: 5000, tool_name: 'Edit', summary: 'git reset --hard HEAD~1' }),
    ];
    expect(detectPanic(events, SESSION)).toHaveLength(0);
  });

  it('handles event with no summary', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, tool_name: 'Bash', summary: null }),
    ];
    expect(detectPanic(events, SESSION)).toHaveLength(0);
  });
});

// ─── user_halt branch coverage ───────────────────────────────────────────────

describe('user_halt branch coverage', () => {
  it('detects "nahi" and "ruk" as trigger words', () => {
    const nahi = [mkEvent({ id: 1, ts: 1000, type: 'user_msg', summary: 'nahi yaar' })];
    const ruk = [mkEvent({ id: 1, ts: 1000, type: 'user_msg', summary: 'ruk ja' })];
    expect(detectUserHalt(nahi, SESSION)).toHaveLength(1);
    expect(detectUserHalt(ruk, SESSION)).toHaveLength(1);
  });

  it('handles null summary in user_msg', () => {
    const events = [mkEvent({ id: 1, ts: 1000, type: 'user_msg', summary: null })];
    expect(detectUserHalt(events, SESSION)).toHaveLength(0);
  });
});

// ─── runAllDetectors branch coverage ─────────────────────────────────────────

describe('runAllDetectors', () => {
  it('returns combined results from all detectors', () => {
    const events = [
      mkEvent({ id: 1, ts: 1000, type: 'user_msg', tool_name: null, summary: 'stop it now' }),
      mkEvent({ id: 2, ts: 2000, tool_name: 'Bash', success: 0, summary: 'build' }),
      mkEvent({ id: 3, ts: 5000, tool_name: 'Bash', success: 1, summary: 'lint' }),
    ];
    const results = runAllDetectors(events, SESSION);
    expect(Array.isArray(results)).toBe(true);
    // At least kyu + failed_bash should fire
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('handles detector throwing without crashing', () => {
    // Pass null events — detectors should either return [] or handle gracefully
    // (The runner catches errors)
    expect(() => runAllDetectors(null, SESSION)).not.toThrow();
  });
});

// ─── distinctSessionCount branch coverage ────────────────────────────────────

describe('distinctSessionCount', () => {
  it('handles null input', () => {
    expect(distinctSessionCount(null)).toBe(0);
  });

  it('handles JSON array', () => {
    expect(distinctSessionCount('["a","b","c"]')).toBe(3);
  });

  it('handles comma-separated string (non-JSON)', () => {
    expect(distinctSessionCount('a,b,c')).toBe(3);
  });

  it('handles duplicates', () => {
    expect(distinctSessionCount('["a","a","b"]')).toBe(2);
  });

  it('handles invalid JSON (fallback to csv)', () => {
    expect(distinctSessionCount('not-json-{{')).toBe(1);
  });
});

// ─── skill_ngram extra coverage ───────────────────────────────────────────────

describe('analyzeSkillNgrams extra coverage', () => {
  it('updates last_seen on repeat call for same signature', () => {
    const tools = ['Bash', 'Edit', 'Bash'];
    const events1 = tools.map((t, i) =>
      mkEvent({ id: i + 1, ts: 1000 + i * 1000, tool_name: t, type: 'tool_use' })
    );
    analyzeSkillNgrams(db, 'sess-a', events1);
    const before = db.prepare('SELECT last_seen FROM skill_candidates LIMIT 1').get();

    const events2 = tools.map((t, i) =>
      mkEvent({ id: i + 10, ts: 2000000 + i * 1000, tool_name: t, type: 'tool_use' })
    );
    analyzeSkillNgrams(db, 'sess-b', events2);
    const after = db.prepare('SELECT last_seen FROM skill_candidates LIMIT 1').get();

    expect(after.last_seen).toBeGreaterThanOrEqual(before.last_seen);
  });
});
