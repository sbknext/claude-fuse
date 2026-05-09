/**
 * tests/api-client.test.js
 * Unit tests for src/api-client.js
 */

import { describe, it, expect } from 'vitest';
import http from 'http';
import { makePostFn, getApiUrl } from '../src/api-client.js';

describe('getApiUrl', () => {
  it('returns default localhost:5457 when env not set', () => {
    const orig = process.env.CLAUDE_FUSE_API_URL;
    delete process.env.CLAUDE_FUSE_API_URL;
    expect(getApiUrl()).toBe('http://localhost:5457');
    if (orig !== undefined) process.env.CLAUDE_FUSE_API_URL = orig;
  });

  it('returns env override when set', () => {
    process.env.CLAUDE_FUSE_API_URL = 'http://localhost:9999';
    expect(getApiUrl()).toBe('http://localhost:9999');
    delete process.env.CLAUDE_FUSE_API_URL;
  });
});

describe('makePostFn', () => {
  it('returns a function', () => {
    const fn = makePostFn(5000);
    expect(typeof fn).toBe('function');
  });

  it('POSTs to /ingest and returns ok=true on 200', async () => {
    // Spin up tiny mock server
    let received = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        received = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    process.env.CLAUDE_FUSE_API_URL = `http://127.0.0.1:${port}`;
    try {
      const postFn = makePostFn(5000);
      const result = await postFn({ source: 'test', session: {}, events: [] });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(received).toContain('source');
    } finally {
      delete process.env.CLAUDE_FUSE_API_URL;
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('throws on timeout', async () => {
    // Server that never responds
    const server = http.createServer(() => {});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    process.env.CLAUDE_FUSE_API_URL = `http://127.0.0.1:${port}`;
    try {
      const postFn = makePostFn(50); // 50ms timeout
      await expect(postFn({ source: 'test' })).rejects.toThrow(/timed out/i);
    } finally {
      delete process.env.CLAUDE_FUSE_API_URL;
      await new Promise(resolve => server.close(resolve));
    }
  }, 5000);
});
