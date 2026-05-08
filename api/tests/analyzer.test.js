import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  generateNgrams,
  gramSignature,
  analyzeSkillNgrams,
  getEligibleCandidates,
  FREQ_THRESHOLD,
  SESSION_THRESHOLD,
} from '../src/analyzers/skill_ngram.js';
import { makeToolSeqEvents } from './fixtures/events.js';

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
  tmpDir = mkdtempSync(join(tmpdir(), 'fuse-test-'));
  db = new Database(join(tmpDir, 'test.db'));
  applySchema(db);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateNgrams', () => {
  it('generates 3-grams from 3-element sequence', () => {
    const grams = generateNgrams(['A', 'B', 'C']);
    const only3 = grams.filter((g) => g.n === 3);
    expect(only3).toHaveLength(1);
    expect(only3[0].gram).toEqual(['A', 'B', 'C']);
  });

  it('generates correct count for 6-element sequence', () => {
    const seq = ['A', 'B', 'C', 'D', 'E', 'F'];
    const grams = generateNgrams(seq);
    // n=3: 4, n=4: 3, n=5: 2, n=6: 1 => 10 total
    expect(grams).toHaveLength(10);
  });

  it('returns empty for sequence shorter than MIN_N=3', () => {
    expect(generateNgrams(['A', 'B'])).toHaveLength(0);
  });

  it('generates no 7-grams', () => {
    const seq = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const grams = generateNgrams(seq);
    expect(grams.every((g) => g.n <= 6)).toBe(true);
  });
});

describe('gramSignature', () => {
  it('returns consistent 64-char hex', () => {
    const sig = gramSignature(['Bash', 'Edit', 'Bash']);
    expect(sig).toHaveLength(64);
    expect(sig).toBe(gramSignature(['Bash', 'Edit', 'Bash']));
  });

  it('differs for different sequences', () => {
    const a = gramSignature(['Bash', 'Edit']);
    const b = gramSignature(['Edit', 'Bash']);
    expect(a).not.toBe(b);
  });
});

describe('analyzeSkillNgrams', () => {
  it('upserts candidates for a tool sequence', () => {
    const events = makeToolSeqEvents(['Bash', 'Edit', 'Bash', 'Grep', 'Read', 'Bash']);
    const touched = analyzeSkillNgrams(db, 'session-1', events);
    expect(touched).toBeGreaterThan(0);
    const rows = db.prepare('SELECT * FROM skill_candidates').all();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('increments frequency on repeat session', () => {
    const events = makeToolSeqEvents(['Bash', 'Edit', 'Bash']);
    analyzeSkillNgrams(db, 'session-1', events);
    analyzeSkillNgrams(db, 'session-2', events);
    const rows = db.prepare('SELECT * FROM skill_candidates ORDER BY frequency DESC').all();
    expect(rows[0].frequency).toBe(2);
  });

  it('returns 0 for sequence shorter than 3 tool events', () => {
    const events = makeToolSeqEvents(['Bash', 'Edit']);
    const touched = analyzeSkillNgrams(db, 'session-1', events);
    expect(touched).toBe(0);
  });

  it('skips non-tool events (no tool_name)', () => {
    const events = [
      { id: 1, ts: 1000, type: 'user_msg', tool_name: null, summary: 'hi' },
      { id: 2, ts: 2000, type: 'tool_use', tool_name: 'Bash', summary: '' },
      { id: 3, ts: 3000, type: 'tool_use', tool_name: 'Edit', summary: '' },
      { id: 4, ts: 4000, type: 'tool_use', tool_name: 'Bash', summary: '' },
    ];
    const touched = analyzeSkillNgrams(db, 'session-1', events);
    expect(touched).toBeGreaterThan(0);
    const rows = db.prepare('SELECT * FROM skill_candidates').all();
    // Only tool events included in sequence
    const seq = JSON.parse(rows[0].tool_sequence_json);
    expect(seq).not.toContain(null);
  });
});

describe('getEligibleCandidates threshold', () => {
  it('returns candidates above freq + session threshold', () => {
    // Build a gram that appears >= FREQ_THRESHOLD times across >= SESSION_THRESHOLD sessions
    const events = makeToolSeqEvents(['Bash', 'Edit', 'Bash']);
    for (let i = 0; i < FREQ_THRESHOLD; i++) {
      analyzeSkillNgrams(db, `session-${i}`, events);
    }

    const eligible = getEligibleCandidates(db);
    expect(eligible.length).toBeGreaterThan(0);
    for (const c of eligible) {
      expect(c.frequency).toBeGreaterThanOrEqual(FREQ_THRESHOLD);
    }
  });

  it('excludes candidates below threshold', () => {
    const events = makeToolSeqEvents(['Bash', 'Edit', 'Bash']);
    // Only 2 sessions — below SESSION_THRESHOLD=3
    analyzeSkillNgrams(db, 'session-1', events);
    analyzeSkillNgrams(db, 'session-2', events);

    const eligible = getEligibleCandidates(db);
    // frequency is 2 < FREQ_THRESHOLD=5, so none eligible
    expect(eligible).toHaveLength(0);
  });
});
