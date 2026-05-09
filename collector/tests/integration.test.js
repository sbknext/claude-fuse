/**
 * tests/integration.test.js
 *
 * Integration test: spin up mock HTTP server, run backfill with fixture file,
 * assert payload shape matches Story 1.1 ingest contract.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile } from '../src/jsonl-parser.js';
import { batchAndSend } from '../src/batcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'sample.jsonl');
const FIXTURE_PROJECT_DIR = '/Users/sam/.claude/projects/-Users-sam-Documents-saas-brain';

// ---------------------------------------------------------------------------
// Mock API server
// ---------------------------------------------------------------------------
let server;
let capturedBodies = [];
let serverPort;

beforeAll(async () => {
  capturedBodies = [];
  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/ingest') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', () => {
          try {
            capturedBodies.push(JSON.parse(body));
          } catch {
            capturedBodies.push({ _parseError: body.slice(0, 200) });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ session_id: 'mock', events_inserted: 1 }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('backfill integration with mock API', () => {
  it('parses fixture and POSTs valid ingest payload', async () => {
    const { session, events, rawLines } = await parseFile(FIXTURE, FIXTURE_PROJECT_DIR);

    // Custom postFn pointing at mock server
    const apiUrl = `http://127.0.0.1:${serverPort}`;
    const postFn = async (payload) => {
      const res = await fetch(`${apiUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    };

    const summary = await batchAndSend(session, events, 'backfill', postFn, rawLines);

    // At least one batch sent successfully
    expect(summary.errors.length).toBe(0);
    expect(capturedBodies.length).toBeGreaterThan(0);
  });

  it('payload matches Story 1.1 ingest contract shape', () => {
    expect(capturedBodies.length).toBeGreaterThan(0);
    const payload = capturedBodies[0];

    // Top-level fields
    expect(payload).toHaveProperty('source');
    expect(['backfill', 'hook']).toContain(payload.source);
    expect(payload).toHaveProperty('session');
    expect(payload).toHaveProperty('events');
    expect(Array.isArray(payload.events)).toBe(true);

    // Session fields per contract
    const s = payload.session;
    expect(s).toHaveProperty('id');
    expect(typeof s.id).toBe('string');
    expect(s).toHaveProperty('user');
    expect(typeof s.user).toBe('string');
    expect(s.user.length).toBeGreaterThan(0);
    expect(s).toHaveProperty('started_at');
    expect(typeof s.started_at).toBe('number');

    // Event fields per contract
    if (payload.events.length > 0) {
      const evt = payload.events[0];
      expect(evt).toHaveProperty('ts');
      expect(typeof evt.ts).toBe('number');
      expect(evt).toHaveProperty('type');
      expect(['user_msg', 'assistant_msg', 'tool_use', 'tool_result']).toContain(evt.type);
    }
  });

  it('session id in payload matches fixture filename', () => {
    const payload = capturedBodies[0];
    expect(payload.session.id).toBe('64c9a58a-dfaa-474f-8db7-fdcc4c5d7b3a');
  });

  it('events batch size does not exceed 500', () => {
    for (const payload of capturedBodies) {
      expect(payload.events.length).toBeLessThanOrEqual(500);
    }
  });
});
