/**
 * DEV-ONLY admin routes.
 * Only available when NODE_ENV !== 'production'.
 *
 * DELETE /admin/wipe — truncate all tables (sessions, events, mistakes, skills).
 */
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// Guard: refuse in production
router.use((_req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'admin routes disabled in production' });
  }
  next();
});

router.delete('/wipe', (_req, res) => {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM mistakes').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM skill_candidates').run();
    db.prepare('DELETE FROM sessions').run();
  })();
  res.json({ ok: true, message: 'all tables wiped' });
});

export default router;
