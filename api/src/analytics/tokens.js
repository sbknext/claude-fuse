/**
 * Token + cost analytics (Story 1.5.7)
 *
 * Extraction strategy (candidate — JSONL format varies across Claude Code versions):
 *   1. Try event.usage.input_tokens + event.usage.output_tokens
 *   2. Try event.message.usage.input_tokens + event.message.usage.output_tokens
 *   3. If neither present → store null + extraction_note="unknown"
 *
 * Cost estimate formula (candidate — assumes no prompt caching):
 *   estimated_cost = (input / 1_000_000 * input_price) + (output / 1_000_000 * output_price)
 * All cost values are rounded to 4 decimal places and labelled "est." in the UI.
 *
 * HONESTY RULES (enforced here, not just UI):
 *   - Never store a fabricated 0 when extraction failed → use null
 *   - Model marked "(assumed)" in extraction_note when defaulted from env
 *   - Price config is static + versioned in models.json — no live API calls
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Pricing ───────────────────────────────────────────────────────────────────

let _pricingCache = null;

function getPricing() {
  if (_pricingCache) return _pricingCache;
  try {
    const data = JSON.parse(
      require('fs').readFileSync(join(__dirname, '../pricing/models.json'), 'utf8')
    );
    _pricingCache = data;
    return data;
  } catch (err) {
    console.warn('[analytics/tokens] Could not load models.json:', err.message);
    return [];
  }
}

/**
 * Look up pricing for a model name.
 * Tries exact match first; then prefix match (e.g. "claude-sonnet" matches "claude-sonnet-4-5").
 * Returns null if no match found.
 */
export function lookupPrice(modelName) {
  if (!modelName) return null;
  const pricing = getPricing();
  const exact = pricing.find(p => p.model === modelName);
  if (exact) return exact;
  // Prefix match: find the most specific prefix
  const prefixMatches = pricing.filter(p => modelName.startsWith(p.model) || p.model.startsWith(modelName));
  if (prefixMatches.length > 0) {
    // Sort by specificity (longer model name = more specific)
    prefixMatches.sort((a, b) => b.model.length - a.model.length);
    return prefixMatches[0];
  }
  return null;
}

/**
 * Estimate cost (USD) from token counts and model.
 * Returns null if tokens or pricing unknown.
 */
export function estimateCost(inputTokens, outputTokens, modelName) {
  if (inputTokens == null || outputTokens == null) return null;
  const price = lookupPrice(modelName);
  if (!price) return null;
  const cost =
    (inputTokens / 1_000_000) * price.input_per_million +
    (outputTokens / 1_000_000) * price.output_per_million;
  return Math.round(cost * 10000) / 10000; // 4 decimal places
}

// ── JSONL token extraction ────────────────────────────────────────────────────

/**
 * Extract (input_tokens, output_tokens, model) from an array of raw JSONL line objects.
 * Returns { input_tokens, output_tokens, model, extraction_note }.
 *
 * Accumulates per-event usage across the session (each turn may have its own usage object).
 * Defensive: logs a single warning per session on any extraction failure; never throws.
 */
export function extractTokensFromLines(lines, sessionId) {
  let totalInput = 0;
  let totalOutput = 0;
  let foundAny = false;
  let model = null;
  let usedPath = null;

  for (const obj of lines) {
    // Extract model if not yet found
    if (!model) {
      const m = obj.model || (obj.message && obj.message.model);
      if (m && typeof m === 'string') model = m;
    }

    // Path 1: event.usage.input_tokens
    if (obj.usage && typeof obj.usage === 'object') {
      const inp = obj.usage.input_tokens;
      const out = obj.usage.output_tokens;
      if (typeof inp === 'number' || typeof out === 'number') {
        totalInput += typeof inp === 'number' ? inp : 0;
        totalOutput += typeof out === 'number' ? out : 0;
        foundAny = true;
        usedPath = 'event.usage';
        continue;
      }
    }

    // Path 2: event.message.usage.input_tokens
    if (obj.message && obj.message.usage && typeof obj.message.usage === 'object') {
      const usage = obj.message.usage;
      const inp = usage.input_tokens;
      const out = usage.output_tokens;
      if (typeof inp === 'number' || typeof out === 'number') {
        totalInput += typeof inp === 'number' ? inp : 0;
        totalOutput += typeof out === 'number' ? out : 0;
        foundAny = true;
        usedPath = 'event.message.usage';
        continue;
      }
    }
  }

  if (!foundAny) {
    if (sessionId) {
      console.warn(`[analytics/tokens] session ${sessionId}: no token usage fields found in JSONL`);
    }
    return {
      input_tokens: null,
      output_tokens: null,
      model: model || null,
      extraction_note: 'unknown',
    };
  }

  // Determine model + assumption note
  const defaultModel = process.env.CLAUDE_FUSE_DEFAULT_MODEL || 'claude-sonnet-4-5';
  let resolvedModel = model;
  let modelNote = '';
  if (!resolvedModel) {
    resolvedModel = defaultModel;
    modelNote = ' (assumed)';
  }

  return {
    input_tokens: totalInput,
    output_tokens: totalOutput,
    model: resolvedModel,
    extraction_note: `${usedPath}${modelNote}`,
  };
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

/**
 * Upsert session_tokens row for a session.
 * Idempotent — safe for backfill re-runs.
 */
export function upsertSessionTokens(db, sessionId, { input_tokens, output_tokens, model, extraction_note }) {
  const estimated_cost_usd = estimateCost(input_tokens, output_tokens, model);

  db.prepare(`
    INSERT INTO session_tokens
      (session_id, input_tokens, output_tokens, model, estimated_cost_usd, extraction_note, extracted_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      model = excluded.model,
      estimated_cost_usd = excluded.estimated_cost_usd,
      extraction_note = excluded.extraction_note,
      extracted_at = excluded.extracted_at
  `).run(
    sessionId,
    input_tokens ?? null,
    output_tokens ?? null,
    model ?? null,
    estimated_cost_usd ?? null,
    extraction_note,
    Date.now()
  );

  return { session_id: sessionId, input_tokens, output_tokens, model, estimated_cost_usd, extraction_note };
}

// ── Analytics queries ─────────────────────────────────────────────────────────

/**
 * Weekly totals: sum input/output tokens + estimated cost for last 7 days.
 */
export function getWeeklyTotals(db) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(st.input_tokens), 0) AS total_input,
      COALESCE(SUM(st.output_tokens), 0) AS total_output,
      COALESCE(SUM(st.estimated_cost_usd), 0) AS total_cost,
      COUNT(*) AS session_count,
      SUM(CASE WHEN st.input_tokens IS NULL THEN 1 ELSE 0 END) AS unknown_count
    FROM session_tokens st
    JOIN sessions s ON s.id = st.session_id
    WHERE s.started_at >= ?
  `).get(cutoff);
  return row;
}

/**
 * Daily breakdown for last 7 days.
 * Returns array of { date, input_tokens, output_tokens, estimated_cost, session_count }
 * sorted ascending by date.
 */
export function getDailyBreakdown(db) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT
      DATE(s.started_at / 1000, 'unixepoch') AS date,
      COALESCE(SUM(st.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(st.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(st.estimated_cost_usd), 0) AS estimated_cost,
      COUNT(*) AS session_count
    FROM session_tokens st
    JOIN sessions s ON s.id = st.session_id
    WHERE s.started_at >= ?
    GROUP BY DATE(s.started_at / 1000, 'unixepoch')
    ORDER BY date ASC
  `).all(cutoff);
  return rows;
}

/**
 * Top 5 sessions by input token count this week.
 */
export function getTopSessions(db, limit = 5) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT
      st.session_id,
      s.project,
      s.branch,
      s.started_at,
      st.input_tokens,
      st.output_tokens,
      st.model,
      st.estimated_cost_usd,
      st.extraction_note
    FROM session_tokens st
    JOIN sessions s ON s.id = st.session_id
    WHERE s.started_at >= ? AND st.input_tokens IS NOT NULL
    ORDER BY st.input_tokens DESC
    LIMIT ?
  `).all(cutoff, limit);
  return rows;
}
