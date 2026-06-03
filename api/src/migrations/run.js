import { createRequire } from 'module';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dbPath = process.env.CLAUDE_FUSE_DB
  ? resolve(process.env.CLAUDE_FUSE_DB)
  : resolve(__dirname, '../../../data/metadata.db');

mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Check if schema_version table exists
const versionTableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
  .get();

let currentVersion = 0;

if (versionTableExists) {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  currentVersion = (row && row.v) ? row.v : 0;
}

if (currentVersion < 1) {
  const sql = readFileSync(join(__dirname, '001_initial.sql'), 'utf8');
  db.exec(sql);
  console.log('Migration 001 applied.');
  currentVersion = 1;
} else {
  console.log(`Schema already at version ${currentVersion} (>= 1). Skipping 001.`);
}

if (currentVersion < 2) {
  const sql = readFileSync(join(__dirname, '002_alert_log.sql'), 'utf8');
  db.exec(sql);
  console.log('Migration 002 applied (alert_log table).');
  currentVersion = 2;
} else {
  console.log(`Schema already at version ${currentVersion} (>= 2). Skipping 002.`);
}

if (currentVersion < 3) {
  const sql = readFileSync(join(__dirname, '003_session_tokens.sql'), 'utf8');
  db.exec(sql);
  console.log('Migration 003 applied (session_tokens table).');
  currentVersion = 3;
} else {
  console.log(`Schema already at version ${currentVersion} (>= 3). Skipping 003.`);
}

console.log(`DB at: ${dbPath} — schema version: ${currentVersion}`);
db.close();
