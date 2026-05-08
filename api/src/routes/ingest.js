/**
 * POST /ingest
 *
 * Accepts batched events from the collector, upserts session, inserts events,
 * writes raw JSONL to disk, runs detectors + analyzer.
 */
import { Router } from 'express';
import { mkdirSync, appendFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDb, withTx } from '../db.js';
import { runAllDetectors } from '../detectors/index.js';
import { analyzeSkillNgrams } from '../analyzers/skill_ngram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

function getSessionsDir() {
  return process.env.CLAUDE_FUSE_SESSIONS_DIR
    ? resolve(process.env.CLAUDE_FUSE_SESSIONS_DIR)
    : resolve(__dirname, '../../../data/sessions');
}

function ensureJsonlPath(sessionId, startedAt) {
  const date = new Date(startedAt);
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = join(getSessionsDir(), dateStr);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId}.jsonl`);
}

router.post('/', (req, res) => {
  const { source, session, events = [], raw_jsonl_chunk } = req.body;

  // --- Validate required fields ---
  if (!source) return res.status(400).json({ error: 'source required' });
  if (!session || !session.id) return res.status(400).json({ error: 'session.id required' });
  if (!session.user) return res.status(400).json({ error: 'session.user required' });
  if (!session.started_at) return res.status(400).json({ error: 'session.started_at required' });

  const db = getDb();

  let eventsInserted = 0;
  let mistakesDetected = 0;
  let skillCandidatesTouched = 0;

  try {
    withTx(() => {
      // Upsert session
      const jsonlPath = ensureJsonlPath(session.id, session.started_at);
      const relJsonlPath = `data/sessions/${new Date(session.started_at).toISOString().slice(0, 10)}/${session.id}.jsonl`;

      db.prepare(`
        INSERT INTO sessions
          (id, user, project, branch, cwd, started_at, ended_at,
           total_cost_usd, total_input_tokens, total_output_tokens,
           total_tool_calls, status, jsonl_path, source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          ended_at = excluded.ended_at,
          total_cost_usd = excluded.total_cost_usd,
          total_input_tokens = excluded.total_input_tokens,
          total_output_tokens = excluded.total_output_tokens,
          total_tool_calls = excluded.total_tool_calls,
          status = excluded.status,
          jsonl_path = excluded.jsonl_path
      `).run(
        session.id,
        session.user,
        session.project ?? null,
        session.branch ?? null,
        session.cwd ?? null,
        session.started_at,
        session.ended_at ?? null,
        session.total_cost_usd ?? 0,
        session.total_input_tokens ?? 0,
        session.total_output_tokens ?? 0,
        session.total_tool_calls ?? 0,
        session.status ?? 'active',
        relJsonlPath,
        source
      );

      // Write raw JSONL to disk
      if (raw_jsonl_chunk) {
        const chunk = raw_jsonl_chunk.endsWith('\n')
          ? raw_jsonl_chunk
          : raw_jsonl_chunk + '\n';
        appendFileSync(jsonlPath, chunk, 'utf8');
      }

      // Insert events
      const insertEvent = db.prepare(`
        INSERT INTO events
          (session_id, ts, type, tool_name, summary, duration_ms, success, jsonl_offset)
        VALUES (?,?,?,?,?,?,?,?)
      `);

      for (const ev of events) {
        if (!ev.ts || !ev.type) continue;
        insertEvent.run(
          session.id,
          ev.ts,
          ev.type,
          ev.tool_name ?? null,
          ev.summary ?? null,
          ev.duration_ms ?? null,
          ev.success !== undefined ? (ev.success ? 1 : 0) : null,
          ev.jsonl_offset ?? null
        );
        eventsInserted++;
      }
    });

    // Fetch all events for this session for detection
    const sessionRow = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    const allEvents = db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts ASC')
      .all(session.id);

    // Run detectors
    const mistakeRows = runAllDetectors(allEvents, sessionRow);
    if (mistakeRows.length) {
      const insertMistake = db.prepare(`
        INSERT INTO mistakes
          (session_id, event_id, pattern, severity, details_json, reviewed, detected_at)
        VALUES (?,?,?,?,?,?,?)
      `);
      const insertMistakes = db.transaction((rows) => {
        for (const row of rows) {
          insertMistake.run(
            row.session_id,
            row.event_id ?? null,
            row.pattern,
            row.severity,
            row.details_json ?? null,
            row.reviewed ?? 0,
            row.detected_at ?? Date.now()
          );
        }
      });
      insertMistakes(mistakeRows);
      mistakesDetected = mistakeRows.length;
    }

    // Run n-gram analyzer
    skillCandidatesTouched = analyzeSkillNgrams(db, session.id, allEvents);

    res.json({
      session_id: session.id,
      events_inserted: eventsInserted,
      mistakes_detected: mistakesDetected,
      skill_candidates_touched: skillCandidatesTouched,
    });
  } catch (err) {
    console.error('[ingest] error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
