/**
 * tests/batcher.test.js
 * Unit tests for src/batcher.js
 */

import { describe, it, expect, vi } from 'vitest';
import { chunkEvents, postWithRetry, batchAndSend } from '../src/batcher.js';

// ---------------------------------------------------------------------------
// chunkEvents
// ---------------------------------------------------------------------------
describe('chunkEvents', () => {
  it('returns empty array for empty events', () => {
    expect(chunkEvents([])).toEqual([]);
  });

  it('puts all events in one chunk when under limits', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      ts: i,
      type: 'tool_use',
      tool_name: 'Bash',
      summary: 'ls',
    }));
    const chunks = chunkEvents(events);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(10);
  });

  it('splits at 500 events limit', () => {
    const events = Array.from({ length: 1001 }, (_, i) => ({
      ts: i,
      type: 'user_msg',
      tool_name: null,
      summary: 'x',
    }));
    const chunks = chunkEvents(events);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
    // Total events preserved
    expect(chunks.flat().length).toBe(1001);
  });

  it('splits at ~1MB size limit', () => {
    // Each event ~2000 bytes => 600 events ~1.2MB
    const bigSummary = 'x'.repeat(1900);
    const events = Array.from({ length: 600 }, (_, i) => ({
      ts: i,
      type: 'user_msg',
      tool_name: null,
      summary: bigSummary,
    }));
    const chunks = chunkEvents(events);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat().length).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// postWithRetry
// ---------------------------------------------------------------------------
describe('postWithRetry', () => {
  it('returns ok=true on first success', async () => {
    const postFn = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: '{}' });
    const result = await postWithRetry(postFn, { source: 'backfill' });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(postFn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxRetries on failure', async () => {
    const postFn = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await postWithRetry(postFn, {}, 3);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(postFn).toHaveBeenCalledTimes(3);
  }, 15000);

  it('succeeds on second attempt after one failure', async () => {
    const postFn = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, status: 200, body: '{}' });
    const result = await postWithRetry(postFn, {}, 3);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  }, 10000);

  it('surfaces HTTP error in result.error', async () => {
    const postFn = vi.fn().mockResolvedValue({ ok: false, status: 500, body: 'Internal Server Error' });
    const result = await postWithRetry(postFn, {}, 1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});

// ---------------------------------------------------------------------------
// batchAndSend
// ---------------------------------------------------------------------------
describe('batchAndSend', () => {
  const session = {
    id: 'test-session',
    user: 'sambhaji',
    project: 'brain',
    started_at: Date.now(),
  };

  it('sends all events and returns summary', async () => {
    const captured = [];
    const postFn = vi.fn(async (payload) => {
      captured.push(payload);
      return { ok: true, status: 200, body: '{}' };
    });

    const events = Array.from({ length: 10 }, (_, i) => ({
      ts: i,
      type: 'tool_use',
      tool_name: 'Bash',
      summary: `cmd ${i}`,
    }));

    const summary = await batchAndSend(session, events, 'backfill', postFn);
    expect(summary.eventsTotal).toBe(10);
    expect(summary.errors.length).toBe(0);
    expect(captured.length).toBeGreaterThanOrEqual(1);
    // Payload shape matches ingest contract
    expect(captured[0]).toHaveProperty('source', 'backfill');
    expect(captured[0]).toHaveProperty('session');
    expect(captured[0]).toHaveProperty('events');
  });

  it('records errors in summary', async () => {
    const postFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const events = Array.from({ length: 5 }, (_, i) => ({
      ts: i,
      type: 'user_msg',
      tool_name: null,
      summary: 'x',
    }));

    const summary = await batchAndSend(session, events, 'backfill', postFn, [], 1);
    expect(summary.errors.length).toBeGreaterThan(0);
  }, 10000);
});
