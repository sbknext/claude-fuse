/**
 * GET /analytics/tokens
 *
 * Returns weekly totals, daily breakdown (7 days), and top-5 sessions by token count.
 * All cost values carry "est." label context — see response shape.
 *
 * Story 1.5.7 — token + cost analytics.
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { getWeeklyTotals, getDailyBreakdown, getTopSessions, extractTokensFromLines, upsertSessionTokens } from '../analytics/tokens.js';

const router = Router();

router.get('/tokens', (req, res) => {
  const db = getDb();

  // Guard: table may not exist yet (running before migration 003)
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_tokens'")
    .get();

  if (!tableExists) {
    return res.json({
      weekly: { total_input: 0, total_output: 0, total_cost: 0, session_count: 0, unknown_count: 0 },
      daily: [],
      top_sessions: [],
      cost_label: 'est.',
      cost_note: 'Estimated from published model prices — actual cost may differ due to caching and tier. Prompt cache hits reduce actual cost — this estimate assumes no caching.',
    });
  }

  try {
    const weekly = getWeeklyTotals(db);
    const daily = getDailyBreakdown(db);
    const top_sessions = getTopSessions(db, 5);

    res.json({
      weekly,
      daily,
      top_sessions,
      cost_label: 'est.',
      cost_note: 'Estimated from published model prices — actual cost may differ due to caching and tier. Prompt cache hits reduce actual cost — this estimate assumes no caching.',
    });
  } catch (err) {
    console.error('[analytics/tokens] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /analytics/tokens/reextract
 *
 * Accepts { session_id, raw_jsonl } and re-extracts token counts for a session.
 * Used by the backfill script to populate session_tokens for pre-1.5.7 sessions.
 * Idempotent (upsert).
 */
router.post('/tokens/reextract', (req, res) => {
  const { session_id, raw_jsonl } = req.body;

  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  if (!raw_jsonl) return res.status(400).json({ error: 'raw_jsonl required' });

  const db = getDb();

  // Guard: table must exist
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_tokens'")
    .get();

  if (!tableExists) {
    return res.status(503).json({ error: 'session_tokens table not found — run npm run migrate first' });
  }

  // Verify session exists
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session_id);
  if (!session) {
    return res.status(404).json({ error: 'session not found' });
  }

  try {
    const lines = raw_jsonl
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const extracted = extractTokensFromLines(lines, session_id);
    const result = upsertSessionTokens(db, session_id, extracted);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[analytics/tokens/reextract] error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
