/**
 * GET  /skills?promoted=null  — list skill candidates
 * POST /skills/:id/promote    — mark promoted_at = now
 */
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();

  let rows;
  if (req.query.promoted === 'null' || req.query.promoted === '') {
    rows = db
      .prepare(
        `SELECT * FROM skill_candidates
         WHERE promoted_at IS NULL
         ORDER BY frequency DESC
         LIMIT 200`
      )
      .all();
  } else if (req.query.promoted !== undefined) {
    // promoted=1 means already promoted
    rows = db
      .prepare(
        `SELECT * FROM skill_candidates
         WHERE promoted_at IS NOT NULL
         ORDER BY frequency DESC
         LIMIT 200`
      )
      .all();
  } else {
    rows = db
      .prepare(
        `SELECT * FROM skill_candidates
         ORDER BY frequency DESC
         LIMIT 200`
      )
      .all();
  }

  res.json({ skills: rows, count: rows.length });
});

router.post('/:id/promote', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  const existing = db
    .prepare('SELECT * FROM skill_candidates WHERE id = ?')
    .get(id);

  if (!existing) return res.status(404).json({ error: 'skill candidate not found' });
  if (existing.promoted_at) {
    return res.status(409).json({
      error: 'already promoted',
      promoted_at: existing.promoted_at,
    });
  }

  const result = db
    .prepare('UPDATE skill_candidates SET promoted_at = ? WHERE id = ?')
    .run(Date.now(), id);

  if (result.changes === 0) {
    return res.status(500).json({ error: 'db update failed' });
  }

  const updated = db.prepare('SELECT * FROM skill_candidates WHERE id = ?').get(id);
  res.json({ success: true, skill: updated });
});

export default router;
