/**
 * src/queue.js
 *
 * Local fallback queue when the API is down.
 * Writes events to ~/.claude-fuse/queue/{ts}-{nonce}.json.
 * flush-queue drains these files to the API.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export function getQueueDir() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.claude-fuse', 'queue');
}

/**
 * Ensure the queue directory exists.
 */
function ensureQueueDir(queueDir) {
  fs.mkdirSync(queueDir, { recursive: true });
}

/**
 * Write a payload to the local queue.
 * @param {object} payload — ingest contract payload
 * @param {string} [queueDir] — override for tests
 */
export function enqueue(payload, queueDir) {
  const dir = queueDir || getQueueDir();
  ensureQueueDir(dir);
  const ts = Date.now();
  const nonce = crypto.randomBytes(4).toString('hex');
  const filename = `${ts}-${nonce}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

/**
 * List all queued payloads in order.
 * Returns array of { filePath, payload }.
 */
export function listQueue(queueDir) {
  const dir = queueDir || getQueueDir();
  let entries;
  try {
    entries = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const items = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      items.push({ filePath, payload: JSON.parse(raw) });
    } catch {
      process.stderr.write(`[queue] skipping corrupt queue file: ${entry}\n`);
    }
  }
  return items;
}

/**
 * Remove a queue file after successful drain.
 */
export function dequeue(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/**
 * Drain all queued payloads to the API.
 * @param {Function} postFn — async (payload) => { ok, status, body }
 * @param {string} [queueDir] — override for tests
 * @returns {{ sent: number, failed: number, errors: string[] }}
 */
export async function flushQueue(postFn, queueDir) {
  const items = listQueue(queueDir);
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const { filePath, payload } of items) {
    try {
      const result = await postFn(payload);
      if (result.ok) {
        dequeue(filePath);
        sent++;
      } else {
        failed++;
        errors.push(`${path.basename(filePath)}: HTTP ${result.status}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${path.basename(filePath)}: ${err.message}`);
    }
  }

  return { sent, failed, errors };
}
