/**
 * Tests for Story 1.5.7 — token + cost analytics
 *
 * Covers:
 *   1. Token extraction: path 1 (event.usage) — both fields present
 *   2. Token extraction: path 2 (event.message.usage) — alternate envelope
 *   3. Token extraction: absent fields → null + extraction_note="unknown"
 *   4. Cost calculation: correct formula, 4 decimal places
 *   5. Cost calculation: null when tokens unknown
 *   6. Cost calculation: null when model not in pricing (unknown model)
 *   7. GET /analytics/tokens endpoint — shape when table exists
 *   8. GET /analytics/tokens/reextract — session not found → 404
 *   9. Model "(assumed)" label when model not in JSONL
 *   10. Accumulation across multiple events (sum)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

let tmpDir;
let app;
let db;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fuse-tokens-test-'));

  process.env.CLAUDE_FUSE_DB = join(tmpDir, 'test-tokens.db');
  process.env.CLAUDE_FUSE_SESSIONS_DIR = join(tmpDir, 'sessions');
  process.env.CLAUDE_FUSE_LEDGER_PATH = join(tmpDir, 'MISTAKES_LEDGER.md');
  process.env.CLAUDE_FUSE_NO_LISTEN = '1';
  process.env.CLAUDE_FUSE_DEFAULT_MODEL = 'claude-sonnet-4-5';
  // Ensure alert channels off for these tests
  process.env.CLAUDE_FUSE_ALERT_CHANNELS = 'none';

  writeFileSync(
    process.env.CLAUDE_FUSE_LEDGER_PATH,
    '## M1 — seed\n\ncontent.\n',
    'utf8'
  );

  await import('../src/migrations/run.js');

  const { default: appModule } = await import('../src/server.js');
  app = appModule;

  const { getDb } = await import('../src/db.js');
  db = getDb();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Pure unit tests for extraction + cost ─────────────────────────────────────

describe('extractTokensFromLines', () => {
  let extractTokensFromLines;
  let estimateCost;
  let lookupPrice;

  beforeAll(async () => {
    const mod = await import('../src/analytics/tokens.js');
    extractTokensFromLines = mod.extractTokensFromLines;
    estimateCost = mod.estimateCost;
    lookupPrice = mod.lookupPrice;
  });

  it('extracts from event.usage (path 1)', () => {
    const lines = [
      { type: 'assistant', usage: { input_tokens: 100, output_tokens: 50 } },
      { type: 'assistant', usage: { input_tokens: 200, output_tokens: 80 } },
    ];
    const result = extractTokensFromLines(lines, 'test-session');
    expect(result.input_tokens).toBe(300);
    expect(result.output_tokens).toBe(130);
    expect(result.extraction_note).toContain('event.usage');
    expect(result.extraction_note).not.toContain('unknown');
  });

  it('extracts from event.message.usage (path 2)', () => {
    const lines = [
      {
        type: 'assistant',
        message: { usage: { input_tokens: 150, output_tokens: 60 }, model: 'claude-haiku-4-5' },
      },
      {
        type: 'assistant',
        message: { usage: { input_tokens: 50, output_tokens: 20 } },
      },
    ];
    const result = extractTokensFromLines(lines, 'test-session');
    expect(result.input_tokens).toBe(200);
    expect(result.output_tokens).toBe(80);
    expect(result.extraction_note).toContain('event.message.usage');
    expect(result.model).toBe('claude-haiku-4-5');
  });

  it('returns null + extraction_note="unknown" when no usage fields present', () => {
    const lines = [
      { type: 'user', message: { content: 'hello' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
    ];
    const result = extractTokensFromLines(lines, 'test-session');
    expect(result.input_tokens).toBeNull();
    expect(result.output_tokens).toBeNull();
    expect(result.extraction_note).toBe('unknown');
  });

  it('labels model "(assumed)" when not in JSONL', () => {
    const lines = [
      { type: 'assistant', usage: { input_tokens: 10, output_tokens: 5 } },
    ];
    const result = extractTokensFromLines(lines, 'test-session');
    expect(result.model).toBe('claude-sonnet-4-5'); // CLAUDE_FUSE_DEFAULT_MODEL
    expect(result.extraction_note).toContain('(assumed)');
  });

  it('does NOT label model "(assumed)" when model present in JSONL', () => {
    const lines = [
      { type: 'assistant', model: 'claude-opus-4-5', usage: { input_tokens: 10, output_tokens: 5 } },
    ];
    const result = extractTokensFromLines(lines, 'test-session');
    expect(result.model).toBe('claude-opus-4-5');
    expect(result.extraction_note).not.toContain('(assumed)');
  });

  it('accumulates token counts across multiple events', () => {
    const lines = [
      { type: 'assistant', usage: { input_tokens: 100, output_tokens: 40 } },
      { type: 'assistant', usage: { input_tokens: 200, output_tokens: 60 } },
      { type: 'assistant', usage: { input_tokens: 300, output_tokens: 100 } },
    ];
    const result = extractTokensFromLines(lines, 'test-session');
    expect(result.input_tokens).toBe(600);
    expect(result.output_tokens).toBe(200);
  });
});

describe('estimateCost', () => {
  let estimateCost;

  beforeAll(async () => {
    const mod = await import('../src/analytics/tokens.js');
    estimateCost = mod.estimateCost;
  });

  it('calculates correct cost to 4 decimal places (sonnet)', () => {
    // claude-sonnet-4-5: $3/M input, $15/M output
    // 1_000_000 in + 1_000_000 out = $3 + $15 = $18.0000
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-sonnet-4-5');
    expect(cost).toBe(18.0);
    expect(String(cost).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('returns null when input_tokens is null', () => {
    expect(estimateCost(null, 1000, 'claude-sonnet-4-5')).toBeNull();
  });

  it('returns null when output_tokens is null', () => {
    expect(estimateCost(1000, null, 'claude-sonnet-4-5')).toBeNull();
  });

  it('returns null when model has no pricing', () => {
    expect(estimateCost(1000, 500, 'unknown-model-xyz')).toBeNull();
  });

  it('small token counts round correctly', () => {
    // 500 input + 200 output with sonnet pricing
    // (500/1M)*3 + (200/1M)*15 = 0.0015 + 0.003 = 0.0045
    const cost = estimateCost(500, 200, 'claude-sonnet-4-5');
    expect(cost).toBe(0.0045);
  });
});

// ── API endpoint tests ────────────────────────────────────────────────────────

const BASE_SESSION = {
  id: 'tokens-test-session-001',
  user: 'sambhaji',
  project: 'brain',
  branch: 'feat/test',
  cwd: '/test',
  started_at: Date.now() - 60000,
  status: 'active',
  total_cost_usd: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tool_calls: 2,
};

describe('GET /analytics/tokens', () => {
  it('returns correct shape', async () => {
    const res = await request(app).get('/analytics/tokens');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('weekly');
    expect(res.body).toHaveProperty('daily');
    expect(res.body).toHaveProperty('top_sessions');
    expect(res.body.cost_label).toBe('est.');
    expect(typeof res.body.cost_note).toBe('string');
    expect(res.body.cost_note).toContain('caching');
  });

  it('weekly totals are numeric', async () => {
    const res = await request(app).get('/analytics/tokens');
    const w = res.body.weekly;
    expect(typeof w.total_input).toBe('number');
    expect(typeof w.total_output).toBe('number');
    expect(typeof w.total_cost).toBe('number');
    expect(typeof w.session_count).toBe('number');
  });
});

describe('POST /analytics/tokens/reextract', () => {
  it('returns 404 when session does not exist', async () => {
    const res = await request(app)
      .post('/analytics/tokens/reextract')
      .send({ session_id: 'nonexistent-session', raw_jsonl: '{}' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when session_id missing', async () => {
    const res = await request(app)
      .post('/analytics/tokens/reextract')
      .send({ raw_jsonl: '{}' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when raw_jsonl missing', async () => {
    const res = await request(app)
      .post('/analytics/tokens/reextract')
      .send({ session_id: 'abc' });
    expect(res.status).toBe(400);
  });

  it('upserts session_tokens for existing session + returns extraction result', async () => {
    // First ingest the session
    const rawJsonl = [
      JSON.stringify({
        type: 'assistant',
        model: 'claude-sonnet-4-5',
        usage: { input_tokens: 300, output_tokens: 100 },
        timestamp: new Date(BASE_SESSION.started_at).toISOString(),
      }),
    ].join('\n');

    await request(app)
      .post('/ingest')
      .send({
        source: 'backfill',
        session: BASE_SESSION,
        events: [
          { ts: BASE_SESSION.started_at + 1000, type: 'tool_use', tool_name: 'Bash', summary: 'test' },
        ],
        raw_jsonl_chunk: rawJsonl,
      });

    // Now re-extract
    const res = await request(app)
      .post('/analytics/tokens/reextract')
      .send({ session_id: BASE_SESSION.id, raw_jsonl: rawJsonl });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.input_tokens).toBe(300);
    expect(res.body.output_tokens).toBe(100);
    expect(res.body.model).toBe('claude-sonnet-4-5');
    // Cost: (300/1M)*3 + (100/1M)*15 = 0.0009 + 0.0015 = 0.0024
    expect(res.body.estimated_cost_usd).toBe(0.0024);
    expect(res.body.extraction_note).not.toContain('unknown');
  });
});
