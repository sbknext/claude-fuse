CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  project TEXT,
  branch TEXT,
  cwd TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  total_cost_usd REAL DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  jsonl_path TEXT,
  source TEXT NOT NULL
);
CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX idx_sessions_project ON sessions(project, started_at DESC);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  tool_name TEXT,
  summary TEXT,
  duration_ms INTEGER,
  success INTEGER,
  jsonl_offset INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX idx_events_session ON events(session_id, ts);
CREATE INDEX idx_events_tool ON events(tool_name, ts);

CREATE TABLE mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_id INTEGER,
  pattern TEXT NOT NULL,
  severity TEXT NOT NULL,
  details_json TEXT,
  ledger_entry_id TEXT,
  reviewed INTEGER DEFAULT 0,
  detected_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);
CREATE INDEX idx_mistakes_session ON mistakes(session_id);
CREATE INDEX idx_mistakes_pattern ON mistakes(pattern, detected_at DESC);

CREATE TABLE skill_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT NOT NULL UNIQUE,
  name TEXT,
  description TEXT,
  tool_sequence_json TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  example_session_ids_json TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  promoted_at INTEGER
);
CREATE INDEX idx_skills_freq ON skill_candidates(frequency DESC);

CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
INSERT INTO schema_version VALUES (1, strftime('%s','now')*1000);
