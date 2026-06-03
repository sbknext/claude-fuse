/**
 * Alert dispatcher (Story 1.5.5).
 *
 * Called after a detection is committed to SQLite, outside the transaction.
 * Fire-and-forget — never blocks or throws back to the caller.
 *
 * Flow per detection row:
 *   1. Skip if CLAUDE_FUSE_ALERT_CHANNELS=none (or not configured).
 *   2. Skip if session is not "active" (last event within ACTIVE_SESSION_WINDOW_MINUTES).
 *   3. Skip if cooldown hit (same session+pattern alerted within 10 min).
 *   4. Build message, dispatch to each configured channel.
 *   5. Log result to alert_log.
 *   6. If Telegram fails → silently fall back to log channel.
 */

import { getDb } from '../db.js';
import { sendTelegram } from './telegram.js';
import { sendFile } from './file.js';

// ── Config helpers ────────────────────────────────────────────────────────────

function getChannels() {
  const raw = (process.env.CLAUDE_FUSE_ALERT_CHANNELS || 'none').trim().toLowerCase();
  if (!raw || raw === 'none') return [];
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

function getTelegramConfig() {
  return {
    token: process.env.CLAUDE_FUSE_TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.CLAUDE_FUSE_TELEGRAM_CHAT_ID || '',
  };
}

function getActiveSessionWindowMs() {
  const minutes = parseInt(process.env.CLAUDE_FUSE_ACTIVE_SESSION_WINDOW_MINUTES || '5', 10);
  return minutes * 60 * 1000;
}

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ── Dashboard URL builder ─────────────────────────────────────────────────────

function dashboardUrl(sessionId) {
  const base = process.env.CLAUDE_FUSE_DASHBOARD_URL || 'http://localhost:5460';
  return `${base}/mistakes?session=${sessionId}`;
}

// ── Severity descriptions (candidate — human decides if it matters) ───────────

const SEVERITY_DESC = {
  high: 'high severity',
  medium: 'medium severity',
  low: 'low severity',
};

function buildMessage(detection, sessionId) {
  const sev = SEVERITY_DESC[detection.severity] || detection.severity;
  const url = dashboardUrl(sessionId);
  // Honest wording: "pattern detected" — not "mistake confirmed"
  return (
    `[claude-fuse] Pattern detected (candidate): <code>${detection.pattern}</code> — ${sev}\n` +
    `Review session: ${url}`
  );
}

// ── Cooldown check ────────────────────────────────────────────────────────────

function isOnCooldown(db, sessionId, pattern) {
  const cutoff = Date.now() - COOLDOWN_MS;
  const row = db
    .prepare(
      'SELECT 1 FROM alert_log WHERE session_id = ? AND pattern = ? AND sent_at > ? AND success = 1 LIMIT 1'
    )
    .get(sessionId, pattern, cutoff);
  return !!row;
}

// ── Persist to alert_log ──────────────────────────────────────────────────────

function logAlert(db, { sessionId, pattern, channel, message, success }) {
  try {
    db.prepare(
      'INSERT INTO alert_log (session_id, pattern, channel, sent_at, message, success) VALUES (?,?,?,?,?,?)'
    ).run(sessionId, pattern, channel, Date.now(), message, success ? 1 : 0);
  } catch (err) {
    console.warn('[alerts/dispatcher] failed to log alert:', err.message);
  }
}

// ── Active session check ──────────────────────────────────────────────────────

function isSessionActive(db, sessionId) {
  const windowMs = getActiveSessionWindowMs();
  const cutoff = Date.now() - windowMs;
  // A session is "active" if its last event is within the window
  // OR if the session row itself is still status='active'
  const row = db
    .prepare(
      `SELECT s.status, MAX(e.ts) as last_event_ts
       FROM sessions s
       LEFT JOIN events e ON e.session_id = s.id
       WHERE s.id = ?`
    )
    .get(sessionId);

  if (!row) return false;
  if (row.status === 'active') return true;
  if (row.last_event_ts && row.last_event_ts > cutoff) return true;
  return false;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * dispatch — call this after detections are committed to DB.
 *
 * @param {Array<{session_id: string, pattern: string, severity: string}>} detections
 */
export async function dispatch(detections) {
  if (!detections || detections.length === 0) return;

  const channels = getChannels();
  if (channels.length === 0) return; // CLAUDE_FUSE_ALERT_CHANNELS=none

  const db = getDb();

  for (const detection of detections) {
    const sessionId = detection.session_id;
    const pattern = detection.pattern;

    // Only alert during active sessions
    if (!isSessionActive(db, sessionId)) continue;

    // Cooldown — skip if already alerted for this (session, pattern) recently
    if (isOnCooldown(db, sessionId, pattern)) continue;

    const message = buildMessage(detection, sessionId);

    for (const channel of channels) {
      if (channel === 'telegram') {
        const cfg = getTelegramConfig();
        // Attempt Telegram; fall back to log on failure
        const result = await sendTelegram(message, cfg);
        if (result.success) {
          logAlert(db, { sessionId, pattern, channel: 'telegram', message, success: true });
        } else {
          // Silent fallback to log
          console.warn(`[alerts/dispatcher] Telegram failed, falling back to log. Reason: ${result.error}`);
          const fileResult = sendFile({ ts: Date.now(), session_id: sessionId, pattern, severity: detection.severity, message });
          logAlert(db, { sessionId, pattern, channel: 'log(fallback)', message, success: fileResult.success });
        }
      } else if (channel === 'log') {
        const fileResult = sendFile({ ts: Date.now(), session_id: sessionId, pattern, severity: detection.severity, message });
        logAlert(db, { sessionId, pattern, channel: 'log', message, success: fileResult.success });
      }
      // Unknown channels silently ignored
    }
  }
}
