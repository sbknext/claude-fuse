-- Migration 003 — session_tokens table for token + cost analytics (Story 1.5.7)
CREATE TABLE IF NOT EXISTS session_tokens (
  session_id TEXT PRIMARY KEY,
  input_tokens INTEGER,            -- nullable: null = extraction failed / unknown
  output_tokens INTEGER,           -- nullable: null = extraction failed / unknown
  model TEXT,                      -- nullable: null = not present in JSONL
  estimated_cost_usd REAL,         -- nullable: null when tokens unknown
  extraction_note TEXT NOT NULL,   -- records which field path succeeded, or "unknown"
  extracted_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_session_tokens_cost ON session_tokens(estimated_cost_usd DESC);
CREATE INDEX IF NOT EXISTS idx_session_tokens_input ON session_tokens(input_tokens DESC);

INSERT INTO schema_version VALUES (3, strftime('%s','now')*1000);
