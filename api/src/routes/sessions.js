/**
 * GET /sessions          — list sessions (limit, project)
 * GET /sessions/:id      — session detail with event counts + linked mistake/skill ids
 */
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const project = req.query.project;

  let rows;
  if (project) {
    rows = db
      .prepare(
        `SELECT s.*,
          (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
          (SELECT COUNT(*) FROM mistakes m WHERE m.session_id = s.id) AS mistake_count
         FROM sessions s
         WHERE s.project = ?
         ORDER BY s.started_at DESC
         LIMIT ?`
      )
      .all(project, limit);
  } else {
    rows = db
      .prepare(
        `SELECT s.*,
          (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
          (SELECT COUNT(*) FROM mistakes m WHERE m.session_id = s.id) AS mistake_count
         FROM sessions s
         ORDER BY s.started_at DESC
         LIMIT ?`
      )
      .all(limit);
  }

  res.json({ sessions: rows, count: rows.length });
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
