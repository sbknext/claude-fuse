import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dbPath = process.env.CLAUDE_FUSE_DB
  ? resolve(process.env.CLAUDE_FUSE_DB)
  : resolve(__dirname, '../../data/metadata.db');

mkdirSync(dirname(dbPath), { recursive: true });

let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

export function withTx(fn) {
  const db = getDb();
  return db.transaction(fn)();
}

/**
 * Read MISTAKES_LEDGER and return next M-number (max existing + 1).
 * Falls back to 1 if ledger doesn't exist or has no entries yet.
 */
export function getNextLedgerNumber() {
  const ledgerPath = process.env.CLAUDE_FUSE_LEDGER_PATH
    ? resolve(process.env.CLAUDE_FUSE_LEDGER_PATH)
    : resolve(__dirname, '../../../MISTAKES_LEDGER.md');

  let content;
  try {
    content = readFileSync(ledgerPath, 'utf8');
  } catch {
    return 1;
  }

  const matches = [...content.matchAll(/^## M(\d+)/gm)];
  if (!matches.length) return 1;
  const max = Math.max(...matches.map((m) => parseInt(m[1], 10)));
  return max + 1;
}

export function getLedgerPath() {
  return process.env.CLAUDE_FUSE_LEDGER_PATH
    ? resolve(process.env.CLAUDE_FUSE_LEDGER_PATH)
    : resolve(__dirname, '../../../MISTAKES_LEDGER.md');
}
