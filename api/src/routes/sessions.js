/**
 * GET /sessions          — list sessions (page, per_page, project, status, q)
 * GET /sessions/:id      — session detail with event counts + linked mistake/skill ids
 */
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();

  // Pagination
  const perPage = Math.min(parseInt(req.query.per_page, 10) || 20, 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * perPage;

  // Legacy limit support (backfill / old callers)
  const legacyLimit = req.query.limit !== undefined
    ? Math.min(parseInt(req.query.limit, 10) || 50, 500)
    : null;

  // Filters
  const project = req.query.project || null;   // substring match
  const status  = req.query.status  || null;   // active|completed|crashed
  const q       = req.query.q       || null;   // search across project, branch, id

  const conditions = [];
  const params = [];

  if (project) {
    conditions.push("s.project LIKE ?");
    params.push(`%${project}%`);
  }
  if (status) {
    conditions.push("s.status = ?");
    params.push(status);
  }
  if (q) {
    conditions.push("(s.project LIKE ? OR s.branch LIKE ? OR s.id LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const baseSelect = `
    SELECT s.*,
      (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
      (SELECT COUNT(*) FROM mistakes m WHERE m.session_id = s.id) AS mistake_count
    FROM sessions s
    ${where}
    ORDER BY COALESCE(s.ended_at, s.started_at) DESC`;

  let rows;
  let total;

  if (legacyLimit !== null) {
    // Legacy callers: honour ?limit= directly, no paging
    rows = db.prepare(`${baseSelect} LIMIT ?`).all(...params, legacyLimit);
    total = rows.length;
  } else {
    // Count for pagination
    const countRow = db
      .prepare(`SELECT COUNT(*) AS n FROM sessions s ${where}`)
      .get(...params);
    total = countRow.n;

    rows = db.prepare(`${baseSelect} LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  }

  res.json({
    sessions: rows,
    count: total,
    page: legacyLimit !== null ? 1 : page,
    per_page: legacyLimit !== null ? total : perPage,
  });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const events = db
    .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts ASC')
    .all(req.params.id);

  const mistakes = db
    .prepare('SELECT id, pattern, severity, detected_at FROM mistakes WHERE session_id = ?')
    .all(req.params.id);

  res.json({ session, events, mistakes });
});

export default router;
