-- Migration 002 — alert_log table for real-time mistake alerts (Story 1.5.5)
CREATE TABLE IF NOT EXISTS alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  message TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_alert_log_session ON alert_log(session_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_cooldown ON alert_log(session_id, pattern, sent_at DESC);

INSERT INTO schema_version VALUES (2, strftime('%s','now')*1000);
