/**
 * Tests for Story 1.5.5 — real-time mistake alerts
 *
 * Covers:
 *   1. CLAUDE_FUSE_ALERT_CHANNELS=none → sends nothing
 *   2. Cooldown suppresses duplicate alert within 10-min window
 *   3. Telegram failure falls back to log silently
 *   4. GET /alerts/recent endpoint
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

let tmpDir;
let app;
let db;

const BASE_SESSION = {
  id: 'alert-test-session-001',
  user: 'sambhaji',
  project: 'brain',
  branch: 'feat/alerts',
  cwd: '/test',
  started_at: Date.now() - 30000, // 30s ago — within active window
  status: 'active',
  total_cost_usd: 0,
  total_input_tokens: 100,
  total_output_tokens: 50,
  total_tool_calls: 5,
};

// Minimal event set that fires failed_bash_retry
function makeDetectionEvents() {
  const T0 = BASE_SESSION.started_at;
  return [
    { ts: T0 + 1000, type: 'tool_use', tool_name: 'Bash', summary: 'npm run build', success: 0, duration_ms: 200, jsonl_offset: null },
    { ts: T0 + 5000, type: 'tool_use', tool_name: 'Bash', summary: 'yarn install', success: 1, duration_ms: 300, jsonl_offset: null },
  ];
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fuse-alerts-test-'));

  process.env.CLAUDE_FUSE_DB = join(tmpDir, 'test-alerts.db');
  process.env.CLAUDE_FUSE_SESSIONS_DIR = join(tmpDir, 'sessions');
  process.env.CLAUDE_FUSE_LEDGER_PATH = join(tmpDir, 'MISTAKES_LEDGER.md');
  process.env.CLAUDE_FUSE_NO_LISTEN = '1';
  process.env.CLAUDE_FUSE_ALERTS_LOG = join(tmpDir, 'alerts.log');
  // Start with alerts OFF
  process.env.CLAUDE_FUSE_ALERT_CHANNELS = 'none';

  const { writeFileSync } = await import('fs');
  writeFileSync(process.env.CLAUDE_FUSE_LEDGER_PATH, '## M1 — seed\n\ncontent.\n', 'utf8');

  // Run migrations (001 + 002)
  await import('../src/migrations/run.js');

  const { default: appModule } = await import('../src/server.js');
  app = appModule;

  const { getDb } = await import('../src/db.js');
  db = getDb();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── 1. CLAUDE_FUSE_ALERT_CHANNELS=none — sends nothing ───────────────────────

describe('alert channels=none', () => {
  it('does NOT write alerts.log when channels=none', async () => {
    process.env.CLAUDE_FUSE_ALERT_CHANNELS = 'none';

    const alertsLogPath = process.env.CLAUDE_FUSE_ALERTS_LOG;

    // Ingest a session with events that trigger a detection
    const res = await request(app).post('/ingest').send({
      source: 'test',
      session: { ...BASE_SESSION, id: 'alert-none-001' },
      events: makeDetectionEvents(),
    });
    expect(res.status).toBe(200);
    expect(res.body.mistakes_detected).toBeGreaterThanOrEqual(1);

    // Give fire-and-forget a moment to settle
    await new Promise(r => setTimeout(r, 100));

    // No alerts.log should have been created
    expect(existsSync(alertsLogPath)).toBe(false);
  });
});

// ── 2. Cooldown suppresses duplicate alert ────────────────────────────────────

describe('alert cooldown', () => {
  it('suppresses a duplicate alert for same session+pattern within 10 min', async () => {
    process.env.CLAUDE_FUSE_ALERT_CHANNELS = 'log';

    const sessionId = 'alert-cooldown-001';

    // Ingest first batch — should fire alert
    await request(app).post('/ingest').send({
      source: 'test',
      session: { ...BASE_SESSION, id: sessionId },
      events: makeDetectionEvents(),
    });

    await new Promise(r => setTimeout(r, 150));

    // Count alert_log rows for this session
    const rows1 = db
      .prepare('SELECT COUNT(*) as n FROM alert_log WHERE session_id = ?')
      .get(sessionId);
    const countAfterFirst = rows1.n;
    expect(countAfterFirst).toBeGreaterThanOrEqual(1);

    // Ingest same session again — cooldown should suppress new alerts
    await request(app).post('/ingest').send({
      source: 'test',
      session: { ...BASE_SESSION, id: sessionId },
      events: makeDetectionEvents(),
    });

    await new Promise(r => setTimeout(r, 150));

    const rows2 = db
      .prepare('SELECT COUNT(*) as n FROM alert_log WHERE session_id = ?')
      .get(sessionId);
    // Should NOT have doubled the count
    expect(rows2.n).toBe(countAfterFirst);
  });
});

// ── 3. Telegram failure falls back to log silently ───────────────────────────

describe('telegram fallback', () => {
  it('falls back to log if Telegram is configured but fails (bad token)', async () => {
    process.env.CLAUDE_FUSE_ALERT_CHANNELS = 'telegram';
    process.env.CLAUDE_FUSE_TELEGRAM_BOT_TOKEN = 'bad-token-for-testing';
    process.env.CLAUDE_FUSE_TELEGRAM_CHAT_ID = '12345678';

    const sessionId = 'alert-tg-fallback-001';
    const alertsLogPath = process.env.CLAUDE_FUSE_ALERTS_LOG;

    const res = await request(app).post('/ingest').send({
      source: 'test',
      session: { ...BASE_SESSION, id: sessionId },
      events: makeDetectionEvents(),
    });
    expect(res.status).toBe(200); // ingest must NOT fail
    expect(res.body.mistakes_detected).toBeGreaterThanOrEqual(1);

    // Give async dispatch time to complete (Telegram call will fail quickly with bad token)
    await new Promise(r => setTimeout(r, 600));

    // alerts.log should exist (fallback to log)
    expect(existsSync(alertsLogPath)).toBe(true);
    const logContent = readFileSync(alertsLogPath, 'utf8');
    expect(logContent).toContain(sessionId);

    // DB should have a log(fallback) entry
    const rows = db
      .prepare("SELECT * FROM alert_log WHERE session_id = ? AND channel LIKE 'log%'")
      .all(sessionId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 4. GET /alerts/recent endpoint ───────────────────────────────────────────

describe('GET /alerts/recent', () => {
  it('returns the last 20 alerts', async () => {
    const res = await request(app).get('/alerts/recent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  it('respects ?limit= param', async () => {
    const res = await request(app).get('/alerts/recent?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.alerts.length).toBeLessThanOrEqual(2);
  });

  it('each row has required fields', async () => {
    const res = await request(app).get('/alerts/recent');
    for (const a of res.body.alerts) {
      expect(a).toHaveProperty('id');
      expect(a).toHaveProperty('session_id');
      expect(a).toHaveProperty('pattern');
      expect(a).toHaveProperty('channel');
      expect(a).toHaveProperty('sent_at');
      expect(a).toHaveProperty('message');
      expect(a).toHaveProperty('success');
    }
  });
});
