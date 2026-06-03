/**
 * GET  /skills?promoted=null  — list skill candidates
 * POST /skills/:id/promote    — mark promoted_at = now
 * POST /skills/:id/stub       — generate a CANDIDATE skill stub template
 * GET  /skills/stubs          — list generated stubs in data/skill-stubs/
 */
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import { getDb } from '../db.js';
import { generateStub } from '../skills/stub-generator.js';
import { aiExplain } from '../skills/ai-explain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function stubsDir() {
  const dataDir = process.env.CLAUDE_FUSE_DATA_DIR
    ? resolve(process.env.CLAUDE_FUSE_DATA_DIR)
    : resolve(__dirname, '../../../data');
  return join(dataDir, 'skill-stubs');
}

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

// ── POST /skills/:id/stub — generate a CANDIDATE stub template ───────────────

router.post('/:id/stub', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  const candidate = db
    .prepare('SELECT * FROM skill_candidates WHERE id = ?')
    .get(id);

  if (!candidate) {
    return res.status(404).json({ error: 'skill candidate not found' });
  }

  // Optional AI enhancement — gated on CLAUDE_FUSE_AI_API_KEY + ?ai=true
  let aiResult = null;
  if (req.query.ai === 'true' && process.env.CLAUDE_FUSE_AI_API_KEY) {
    try {
      const tools = JSON.parse(candidate.tool_sequence_json);
      // Count distinct sessions
      let distinctSessions = 0;
      try {
        const ids = JSON.parse(candidate.example_session_ids_json || '[]');
        if (Array.isArray(ids)) {
          distinctSessions = new Set(ids.flatMap((s) => String(s).split(','))).size;
        }
      } catch { /* ignore */ }

      aiResult = await aiExplain(tools, candidate.frequency, distinctSessions);
    } catch {
      // Best-effort — fall through without AI
    }
  }

  try {
    const result = generateStub(candidate, aiResult);
    return res.json({
      success: true,
      path: result.path,
      filename: result.filename,
      markdown: result.markdown,
      ai_used: aiResult !== null,
    });
  } catch (err) {
    console.error('[skills/stub] error:', err);
    return res.status(500).json({ error: err.message || 'stub generation failed' });
  }
});

// ── GET /skills/stubs — list generated stub files ────────────────────────────

router.get('/stubs', (req, res) => {
  const dir = stubsDir();

  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    // Directory doesn't exist yet — no stubs
    return res.json({ stubs: [], count: 0 });
  }

  const stubs = files
    .map((filename) => {
      try {
        const filePath = join(dir, filename);
        const stat = statSync(filePath);
        return {
          filename,
          path: filePath,
          size_bytes: stat.size,
          created_at: stat.birthtimeMs || stat.ctimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.created_at - a.created_at);

  res.json({ stubs, count: stubs.length });
});

export default router;
