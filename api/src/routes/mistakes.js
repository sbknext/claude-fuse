/**
 * GET  /mistakes?reviewed=0   — list mistakes
 * POST /mistakes/:id/promote  — append M{n+1} to MISTAKES_LEDGER.md
 */
import { Router } from 'express';
import { appendFileSync } from 'fs';
import { getDb, getNextLedgerNumber, getLedgerPath } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (req.query.reviewed !== undefined) {
    conditions.push('m.reviewed = ?');
    params.push(parseInt(req.query.reviewed, 10));
  }
  if (req.query.pattern) {
    conditions.push('m.pattern = ?');
    params.push(req.query.pattern);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT m.*, s.project, s.branch, s.user
       FROM mistakes m
       JOIN sessions s ON s.id = m.session_id
       ${where}
       ORDER BY m.detected_at DESC
       LIMIT 200`
    )
    .all(...params);

  res.json({ mistakes: rows, count: rows.length });
});

router.post('/:id/promote', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  const mistake = db
    .prepare(
      `SELECT m.*, s.project, s.branch, s.user, s.started_at
       FROM mistakes m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.id = ?`
    )
    .get(id);

  if (!mistake) return res.status(404).json({ error: 'mistake not found' });
  if (mistake.ledger_entry_id) {
    return res.status(409).json({
      error: 'already promoted',
      ledger_entry_id: mistake.ledger_entry_id,
    });
  }

  const n = getNextLedgerNumber();
  const entryId = `M${n}`;
  const ledgerPath = getLedgerPath();

  // Build ledger entry
  const shortSession = mistake.session_id.slice(0, 8);
  const dateStr = new Date(mistake.started_at).toISOString().slice(0, 10);
  const promoteDate = new Date()
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16);
  const tsIso = new Date(mistake.detected_at).toISOString();

  // One-line summary from details_json
  let detailsSummary = '';
  try {
    const d = JSON.parse(mistake.details_json || '{}');
    detailsSummary = Object.entries(d)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
  } catch {
    detailsSummary = mistake.details_json || '';
  }

  const entry = `
## ${entryId} — ${mistake.pattern} in session ${shortSession} (${dateStr})

**Severity:** ${mistake.severity}
**Auto-detected by:** claude-fuse ${mistake.pattern}
**Session:** \`${mistake.session_id}\` (project: ${mistake.project ?? 'unknown'}, branch: ${mistake.branch ?? 'unknown'})
**Event:** ${mistake.event_id ?? 'n/a'} at ${tsIso}
**Details:** ${detailsSummary}

(Promoted from claude-fuse dashboard on ${promoteDate}.)
`;

  try {
    appendFileSync(ledgerPath, entry, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: `failed to write ledger: ${err.message}` });
  }

  // Update DB
  const result = db
    .prepare('UPDATE mistakes SET ledger_entry_id = ?, reviewed = 1 WHERE id = ?')
    .run(entryId, id);

  if (result.changes === 0) {
    return res.status(500).json({ error: 'db update failed' });
  }

  const updated = db.prepare('SELECT * FROM mistakes WHERE id = ?').get(id);
  res.json({ success: true, ledger_entry_id: entryId, mistake: updated });
});

export default router;
