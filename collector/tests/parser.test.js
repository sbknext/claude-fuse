/**
 * tests/parser.test.js
 *
 * Unit tests for src/jsonl-parser.js
 * Tests against the real JSONL fixture in tests/fixtures/sample.jsonl.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseSince,
  dirToProject,
  classifyLine,
  parseFile,
} from '../src/jsonl-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'sample.jsonl');
const FIXTURE_SESSION_ID = '64c9a58a-dfaa-474f-8db7-fdcc4c5d7b3a'; // matches filename

// ---------------------------------------------------------------------------
// parseSince
// ---------------------------------------------------------------------------
describe('parseSince', () => {
  it('parses 30d', () => {
    const before = Date.now();
    const ts = parseSince('30d');
    expect(ts).toBeLessThan(before);
    expect(before - ts).toBeGreaterThanOrEqual(30 * 86400000 - 100);
  });

  it('parses 7d', () => {
    const ts = parseSince('7d');
    expect(Date.now() - ts).toBeGreaterThanOrEqual(7 * 86400000 - 100);
  });

  it('parses 24h', () => {
    const ts = parseSince('24h');
    expect(Date.now() - ts).toBeGreaterThanOrEqual(24 * 3600000 - 100);
  });

  it('parses ISO date', () => {
    const ts = parseSince('2026-01-01');
    expect(ts).toBe(Date.parse('2026-01-01'));
  });

  it('throws on invalid input', () => {
    expect(() => parseSince('notvalid')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// dirToProject
// ---------------------------------------------------------------------------
describe('dirToProject', () => {
  it('extracts project from directory name', () => {
    const p = dirToProject('/Users/sam/.claude/projects/-Users-sam-Documents-saas-brain');
    expect(p).toContain('Documents');
    expect(p).toContain('saas');
    expect(p).toContain('brain');
  });
});

// ---------------------------------------------------------------------------
// classifyLine
// ---------------------------------------------------------------------------
describe('classifyLine', () => {
  it('classifies user message', () => {
    const obj = { type: 'user', message: { role: 'user', content: 'hello world' } };
    const result = classifyLine(obj);
    expect(result.type).toBe('user_msg');
    expect(result.summary).toContain('hello world');
  });

  it('classifies assistant message with tool_use', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Bash', id: 'abc', input: { command: 'ls -la' } }],
      },
    };
    const result = classifyLine(obj);
    expect(result.type).toBe('tool_use');
    expect(result.tool_name).toBe('Bash');
    expect(result.summary).toContain('ls -la');
  });

  it('classifies plain assistant text', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Here is my analysis.' }],
      },
    };
    const result = classifyLine(obj);
    expect(result.type).toBe('assistant_msg');
  });

  it('returns null for queue-operation', () => {
    const obj = { type: 'queue-operation', operation: 'enqueue' };
    expect(classifyLine(obj)).toBeNull();
  });

  it('returns null for ai-title', () => {
    const obj = { type: 'ai-title', aiTitle: 'Test' };
    expect(classifyLine(obj)).toBeNull();
  });

  it('truncates long summaries at 120 chars', () => {
    const longText = 'a'.repeat(200);
    const obj = { type: 'user', message: { role: 'user', content: longText } };
    const result = classifyLine(obj);
    expect(result.summary.length).toBeLessThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------
// scanProjectDir / scanAllProjects
// ---------------------------------------------------------------------------
import { scanProjectDir, scanAllProjects } from '../src/jsonl-parser.js';
import fs from 'fs';
import os from 'os';

describe('scanProjectDir', () => {
  it('yields jsonl files with mtime >= sinceMs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-scan-test-'));
    try {
      // Write a jsonl file
      fs.writeFileSync(path.join(tmpDir, 'abc.jsonl'), '{"type":"user"}\n');
      const results = [];
      for await (const item of scanProjectDir(tmpDir, 0)) {
        results.push(item);
      }
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].filePath).toContain('abc.jsonl');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips files older than sinceMs', async () => {
    // Use a future sinceMs so no files qualify
    const results = [];
    for await (const item of scanProjectDir(os.tmpdir(), Date.now() + 999999999)) {
      results.push(item);
    }
    expect(results.length).toBe(0);
  });

  it('handles missing directory gracefully', async () => {
    const results = [];
    for await (const item of scanProjectDir('/nonexistent/path/xyz', 0)) {
      results.push(item);
    }
    expect(results.length).toBe(0);
  });
});

describe('scanAllProjects', () => {
  it('skips dirs not starting with -Users-sam-', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-projects-'));
    try {
      // Create a non-sam dir with a jsonl
      fs.mkdirSync(path.join(tmpDir, '-Users-other-project'));
      fs.writeFileSync(path.join(tmpDir, '-Users-other-project', 'sess.jsonl'), '{}');
      const results = [];
      for await (const item of scanAllProjects(tmpDir, 0)) {
        results.push(item);
      }
      expect(results.length).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('yields files from -Users-sam- dirs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-projects-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '-Users-sam-Documents-saas-brain'));
      fs.writeFileSync(
        path.join(tmpDir, '-Users-sam-Documents-saas-brain', 'deadbeef-0000-0000-0000-000000000001.jsonl'),
        '{"type":"user"}\n'
      );
      const results = [];
      for await (const item of scanAllProjects(tmpDir, 0)) {
        results.push(item);
      }
      expect(results.length).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles missing projects dir gracefully', async () => {
    const results = [];
    for await (const item of scanAllProjects('/nonexistent', 0)) {
      results.push(item);
    }
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseFile — real fixture round-trip
// ---------------------------------------------------------------------------
describe('parseFile (real fixture)', () => {
  it('parses fixture and returns correct session id', async () => {
    const result = await parseFile(FIXTURE);
    expect(result.session.id).toBe(FIXTURE_SESSION_ID);
  });

  it('returns events array with at least 1 event', async () => {
    const result = await parseFile(FIXTURE);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('extracts tool_name from tool_use events', async () => {
    const result = await parseFile(FIXTURE);
    const toolEvents = result.events.filter(e => e.type === 'tool_use');
    // Fixture contains assistant messages with tool_use content
    // At least some should have a tool_name
    if (toolEvents.length > 0) {
      const withName = toolEvents.filter(e => e.tool_name !== null);
      expect(withName.length).toBeGreaterThan(0);
    }
  });

  it('skips malformed lines without throwing', async () => {
    // The fixture has one intentionally malformed line
    // parseFile should complete without error
    await expect(parseFile(FIXTURE)).resolves.toBeDefined();
  });

  it('returns raw lines matching file line count', async () => {
    const result = await parseFile(FIXTURE);
    // Fixture has 28 lines
    expect(result.rawLines.length).toBe(28);
  });

  it('event timestamps are monotonic', async () => {
    const result = await parseFile(FIXTURE);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].ts).toBeGreaterThanOrEqual(result.events[i - 1].ts);
    }
  });

  it('session has required ingest contract fields', async () => {
    const result = await parseFile(FIXTURE);
    const s = result.session;
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('user');
    expect(s).toHaveProperty('started_at');
    expect(typeof s.user).toBe('string');
    expect(s.user.length).toBeGreaterThan(0);
  });

  it('all events have required ingest contract fields', async () => {
    const result = await parseFile(FIXTURE);
    for (const evt of result.events) {
      expect(evt).toHaveProperty('ts');
      expect(evt).toHaveProperty('type');
      expect(['user_msg', 'assistant_msg', 'tool_use', 'tool_result']).toContain(evt.type);
    }
  });
});
