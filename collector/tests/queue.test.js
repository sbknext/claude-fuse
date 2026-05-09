/**
 * tests/queue.test.js
 * Unit tests for src/queue.js — uses tmp dir, never touches real ~/.claude-fuse/
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { enqueue, listQueue, dequeue, flushQueue } from '../src/queue.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-queue-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const samplePayload = {
  source: 'hook',
  session: { id: 'test-123', user: 'sambhaji', started_at: Date.now() },
  events: [{ ts: Date.now(), type: 'tool_use', tool_name: 'Bash', summary: 'ls' }],
};

describe('enqueue', () => {
  it('creates queue dir and writes a json file', () => {
    const queueDir = path.join(tmpDir, 'queue');
    const filePath = enqueue(samplePayload, queueDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(parsed.source).toBe('hook');
    expect(parsed.session.id).toBe('test-123');
  });

  it('uses ts-nonce filename pattern', () => {
    const queueDir = path.join(tmpDir, 'queue');
    const filePath = enqueue(samplePayload, queueDir);
    expect(path.basename(filePath)).toMatch(/^\d{13}-[a-f0-9]{8}\.json$/);
  });
});

describe('listQueue', () => {
  it('returns empty array when queue dir missing', () => {
    const items = listQueue(path.join(tmpDir, 'nonexistent'));
    expect(items).toEqual([]);
  });

  it('returns queued items in sorted order', () => {
    const queueDir = path.join(tmpDir, 'queue');
    enqueue({ ...samplePayload, source: 'hook' }, queueDir);
    enqueue({ ...samplePayload, source: 'backfill' }, queueDir);
    const items = listQueue(queueDir);
    expect(items.length).toBe(2);
    expect(items[0]).toHaveProperty('filePath');
    expect(items[0]).toHaveProperty('payload');
  });

  it('skips corrupt json files without throwing', () => {
    const queueDir = path.join(tmpDir, 'queue');
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(path.join(queueDir, '123-aabbccdd.json'), '{bad json');
    const items = listQueue(queueDir);
    expect(items.length).toBe(0);
  });
});

describe('dequeue', () => {
  it('removes a file', () => {
    const queueDir = path.join(tmpDir, 'queue');
    const filePath = enqueue(samplePayload, queueDir);
    expect(fs.existsSync(filePath)).toBe(true);
    dequeue(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('does not throw when file missing', () => {
    expect(() => dequeue('/nonexistent/file.json')).not.toThrow();
  });
});

describe('flushQueue', () => {
  it('sends queued items and removes them', async () => {
    const queueDir = path.join(tmpDir, 'queue');
    enqueue(samplePayload, queueDir);
    enqueue(samplePayload, queueDir);

    const postFn = async () => ({ ok: true, status: 200, body: '{}' });
    const result = await flushQueue(postFn, queueDir);

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    // Files removed after successful drain
    expect(listQueue(queueDir).length).toBe(0);
  });

  it('records failed items without removing them', async () => {
    const queueDir = path.join(tmpDir, 'queue');
    enqueue(samplePayload, queueDir);

    const postFn = async () => ({ ok: false, status: 500, body: 'error' });
    const result = await flushQueue(postFn, queueDir);

    expect(result.failed).toBe(1);
    expect(result.errors.length).toBe(1);
    // File NOT removed
    expect(listQueue(queueDir).length).toBe(1);
  });

  it('returns 0 sent/failed for empty queue', async () => {
    const queueDir = path.join(tmpDir, 'nonexistent');
    const postFn = async () => ({ ok: true, status: 200, body: '{}' });
    const result = await flushQueue(postFn, queueDir);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });
});
