import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

// Use temp dirs for db + sessions + ledger so tests are isolated
let tmpDir;
let app;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fuse-ingest-test-'));

  process.env.CLAUDE_FUSE_DB = join(tmpDir, 'test.db');
  process.env.CLAUDE_FUSE_SESSIONS_DIR = join(tmpDir, 'sessions');
  process.env.CLAUDE_FUSE_LEDGER_PATH = join(tmpDir, 'MISTAKES_LEDGER.md');
  process.env.CLAUDE_FUSE_NO_LISTEN = '1';

  // Init ledger with one existing entry so getNextLedgerNumber works
  writeFileSync(
    process.env.CLAUDE_FUSE_LEDGER_PATH,
    '## M1 — some old entry\n\nold content.\n',
    'utf8'
  );

  // Run migrations first
  await import('../src/migrations/run.js');

  // Reset db module singleton so it uses our test db
  // (server.js imports db.js which caches the connection)
  const { default: appModule } = await import('../src/server.js');
  app = appModule;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const BASE_SESSION = {
  id: 'int-test-session-001',
  user: 'sambhaji',
  project: 'brain',
  branch: 'master',
  cwd: '/test',
  started_at: Date.now() - 60000,
  status: 'active',
  total_cost_usd: 0.05,
  total_input_tokens: 500,
  total_output_tokens: 200,
  total_tool_calls: 10,
};

// 50-event batch mixing tools to trigger detectors
function make50Events() {
  const T0 = BASE_SESSION.started_at;
  const events = [];
  let id = 1;

  // failed_bash_retry trigger: failed Bash + dissimilar Bash within 60s
  events.push({ ts: T0 + 1000, type: 'tool_use', tool_name: 'Bash', summary: 'npm run build', success: 0, duration_ms: 200, jsonl_offset: null });
  events.push({ ts: T0 + 5000, type: 'tool_use', tool_name: 'Bash', summary: 'yarn install', success: 1, duration_ms: 300, jsonl_offset: null });

  // user_halt trigger
  events.push({ ts: T0 + 6000, type: 'user_msg', tool_name: null, summary: 'kyu aisa kar raha hai', success: null, duration_ms: null, jsonl_offset: null });

  // repeated_grep_read trigger (3x same file within 2min)
  events.push({ ts: T0 + 7000, type: 'tool_use', tool_name: 'Grep', summary: 'Grep src/utils.js', success: 1, duration_ms: 50, jsonl_offset: null });
  events.push({ ts: T0 + 30000, type: 'tool_use', tool_name: 'Read', summary: 'Read src/utils.js', success: 1, duration_ms: 50, jsonl_offset: null });
  events.push({ ts: T0 + 60000, type: 'tool_use', tool_name: 'Grep', summary: 'Grep src/utils.js', success: 1, duration_ms: 50, jsonl_offset: null });

  // panic_reset trigger: commit then reset within 5min
  events.push({ ts: T0 + 70000, type: 'tool_use', tool_name: 'Bash', summary: 'git commit -m fix auth', success: 1, duration_ms: 100, jsonl_offset: null });
  events.push({ ts: T0 + 80000, type: 'tool_use', tool_name: 'Bash', summary: 'git reset --hard HEAD~1', success: 1, duration_ms: 100, jsonl_offset: null });

  // Pad to 50 events with Bash/Edit/Read cycle
  while (events.length < 50) {
    const i = events.length;
    const tools = ['Bash', 'Edit', 'Read', 'Grep', 'Bash'];
    events.push({
      ts: T0 + 100000 + i * 1000,
      type: 'tool_use',
      tool_name: tools[i % tools.length],
      summary: `step ${i}`,
      success: 1,
      duration_ms: 100,
      jsonl_offset: null,
    });
  }

  return events;
}

describe('POST /ingest', () => {
  it('accepts a 50-event batch and returns summary', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({
        source: 'test',
        session: BASE_SESSION,
        events: make50Events(),
        raw_jsonl_chunk: '{"event":"test"}\n',
      });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe(BASE_SESSION.id);
    expect(res.body.events_inserted).toBe(50);
    expect(res.body.mistakes_detected).toBeGreaterThanOrEqual(3); // at least kyu + bash_retry + panic
    expect(typeof res.body.skill_candidates_touched).toBe('number');
  });

  it('is idempotent — re-ingesting same session updates it', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({
        source: 'test',
        session: { ...BASE_SESSION, status: 'completed', ended_at: Date.now() },
        events: [],
      });
    expect(res.status).toBe(200);
    expect(res.body.events_inserted).toBe(0);
  });

  it('rejects missing session id', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({ source: 'test', session: { user: 'sambhaji', started_at: Date.now() } });
    expect(res.status).toBe(400);
  });

  it('rejects missing source', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({ session: BASE_SESSION, events: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /sessions', () => {
  it('returns session list', async () => {
    const res = await request(app).get('/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThan(0);
  });

  it('filters by project', async () => {
    const res = await request(app).get('/sessions?project=brain');
    expect(res.status).toBe(200);
    for (const s of res.body.sessions) {
      expect(s.project).toBe('brain');
    }
  });

  it('GET /sessions/:id returns detail', async () => {
    const res = await request(app).get(`/sessions/${BASE_SESSION.id}`);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(BASE_SESSION.id);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(Array.isArray(res.body.mistakes)).toBe(true);
  });

  it('returns 404 for unknown session', async () => {
    const res = await request(app).get('/sessions/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

describe('GET /mistakes', () => {
  it('returns mistake list', async () => {
    const res = await request(app).get('/mistakes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.mistakes)).toBe(true);
  });

  it('filters by reviewed=0', async () => {
    const res = await request(app).get('/mistakes?reviewed=0');
    expect(res.status).toBe(200);
    for (const m of res.body.mistakes) {
      expect(m.reviewed).toBe(0);
    }
  });
});

describe('POST /mistakes/:id/promote', () => {
  it('promotes a mistake to ledger', async () => {
    // Get first unreviewed mistake
    const listRes = await request(app).get('/mistakes?reviewed=0');
    expect(listRes.body.mistakes.length).toBeGreaterThan(0);
    const mistake = listRes.body.mistakes[0];

    const res = await request(app).post(`/mistakes/${mistake.id}/promote`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ledger_entry_id).toMatch(/^M\d+$/);

    // Check ledger file was written
    const ledger = readFileSync(process.env.CLAUDE_FUSE_LEDGER_PATH, 'utf8');
    expect(ledger).toContain(`## ${res.body.ledger_entry_id}`);
    expect(ledger).toContain(mistake.pattern);
  });

  it('returns 409 if already promoted', async () => {
    const listRes = await request(app).get('/mistakes?reviewed=0');
    const mistake = listRes.body.mistakes[0];

    // Promote once
    await request(app).post(`/mistakes/${mistake.id}/promote`);
    // Try again
    const res = await request(app).post(`/mistakes/${mistake.id}/promote`);
    expect(res.status).toBe(409);
  });

  it('returns 404 for nonexistent mistake', async () => {
    const res = await request(app).post('/mistakes/99999/promote');
    expect(res.status).toBe(404);
  });
});

describe('GET /skills', () => {
  it('returns skill candidates', async () => {
    const res = await request(app).get('/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.skills)).toBe(true);
  });

  it('filters unpromoted', async () => {
    const res = await request(app).get('/skills?promoted=null');
    expect(res.status).toBe(200);
    for (const s of res.body.skills) {
      expect(s.promoted_at).toBeNull();
    }
  });
});

describe('POST /skills/:id/promote', () => {
  it('promotes a skill candidate', async () => {
    const listRes = await request(app).get('/skills?promoted=null');
    if (listRes.body.skills.length === 0) {
      // Nothing to promote — skip
      return;
    }
    const skill = listRes.body.skills[0];
    const res = await request(app).post(`/skills/${skill.id}/promote`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.skill.promoted_at).toBeTruthy();
  });

  it('returns 409 if already promoted', async () => {
    const listRes = await request(app).get('/skills?promoted=null');
    if (listRes.body.skills.length === 0) return;
    const skill = listRes.body.skills[0];
    await request(app).post(`/skills/${skill.id}/promote`);
    const res = await request(app).post(`/skills/${skill.id}/promote`);
    expect(res.status).toBe(409);
  });

  it('returns 404 for nonexistent skill', async () => {
    const res = await request(app).post('/skills/99999/promote');
    expect(res.status).toBe(404);
  });
});
