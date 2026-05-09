/**
 * tests/hook-fastfail.test.js
 *
 * Hook fast-fail test:
 * With no API running, claude-fuse-hook.js must:
 *   - Exit 0 within 1s
 *   - Write a queue file under the tmp HOME
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.join(__dirname, '..', 'bin', 'claude-fuse-hook.js');

function runHook(eventName, stdinPayload, env, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      process.execPath,
      [HOOK_SCRIPT, eventName],
      { env, timeout: timeoutMs },
      (error, stdout, stderr) => {
        // error is set if process exits non-zero OR times out
        resolve({ error, stdout, stderr, code: error?.code ?? 0 });
      }
    );
    if (stdinPayload) {
      proc.stdin.write(stdinPayload);
    }
    proc.stdin.end();
  });
}

describe('claude-fuse-hook fast-fail', () => {
  it('exits 0 within 1s when API is not running', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hook-test-'));
    try {
      const env = {
        ...process.env,
        HOME: tmpHome,
        // Point to a port nobody is listening on
        CLAUDE_FUSE_API_URL: 'http://localhost:59999',
      };

      const start = Date.now();
      const result = await runHook('PreToolUse', JSON.stringify({ session_id: 'test-sess' }), env, 5000);
      const elapsed = Date.now() - start;

      // Must exit 0
      expect(result.code).toBe(0);
      expect(result.error).toBeNull();

      // Must complete within 1.5s (500ms timeout + some overhead)
      expect(elapsed).toBeLessThan(1500);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  }, 10000);

  it('writes a queue file when API is not running', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hook-queue-'));
    try {
      const env = {
        ...process.env,
        HOME: tmpHome,
        CLAUDE_FUSE_API_URL: 'http://localhost:59999',
      };

      await runHook('PostToolUse', JSON.stringify({ session_id: 'test-sess-2', tool_name: 'Bash' }), env, 5000);

      const queueDir = path.join(tmpHome, '.claude-fuse', 'queue');
      expect(fs.existsSync(queueDir)).toBe(true);

      const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBeGreaterThanOrEqual(1);

      // Queue file must contain a valid ingest payload
      const payload = JSON.parse(fs.readFileSync(path.join(queueDir, files[0]), 'utf8'));
      expect(payload).toHaveProperty('source', 'hook');
      expect(payload).toHaveProperty('session');
      expect(payload).toHaveProperty('events');
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  }, 10000);
});
