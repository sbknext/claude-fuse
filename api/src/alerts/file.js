/**
 * FileSender — appends one JSONL line to data/alerts.log.
 *
 * Never throws. Returns { success: true } or { success: false, error }.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getAlertsLogPath() {
  if (process.env.CLAUDE_FUSE_ALERTS_LOG) {
    return resolve(process.env.CLAUDE_FUSE_ALERTS_LOG);
  }
  // Default: <repo>/data/alerts.log
  return resolve(__dirname, '../../../data/alerts.log');
}

/**
 * @param {object} payload
 * @param {number}  payload.ts         — epoch ms
 * @param {string}  payload.session_id
 * @param {string}  payload.pattern
 * @param {string}  payload.severity
 * @param {string}  payload.message
 * @returns {{ success: boolean, error?: string }}
 */
export function sendFile(payload) {
  const logPath = getAlertsLogPath();
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    const line = JSON.stringify(payload) + '\n';
    appendFileSync(logPath, line, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
