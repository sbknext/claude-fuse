/**
 * GET /alerts/recent
 *
 * Returns the last 20 alert_log rows (most-recent first).
 * Used by the dashboard Alerts tab.
 */
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/recent', (req, res) => {
  const db = getDb();

  // Ensure table exists — guard against running before migration 002
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_log'")
    .get();

  if (!tableExists) {
    return res.json({ alerts: [], count: 0 });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const rows = db
    .prepare(
      `SELECT id, session_id, pattern, channel, sent_at, message, success
       FROM alert_log
       ORDER BY sent_at DESC
       LIMIT ?`
    )
    .all(limit);

  res.json({ alerts: rows, count: rows.length });
});

export default router;
