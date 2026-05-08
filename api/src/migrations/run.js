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

if (versionTableExists) {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  if (row && row.v >= 1) {
    console.log(`Schema already at version ${row.v}. No-op.`);
    db.close();
    process.exit(0);
  }
}

const sqlPath = join(__dirname, '001_initial.sql');
const sql = readFileSync(sqlPath, 'utf8');

db.exec(sql);
console.log(`Migration applied. DB at: ${dbPath}`);
db.close();
