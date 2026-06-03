/**
 * src/api-client.js
 *
 * HTTP client for the claude-fuse API at :5457.
 * Exposes a postFn factory that respects per-path timeouts:
 *   - hook path: 500ms
 *   - backfill path: 30s
 */

const DEFAULT_API_URL = 'http://localhost:5457';

export function getApiUrl() {
  return process.env.CLAUDE_FUSE_API_URL || DEFAULT_API_URL;
}

/**
 * POST to /analytics/tokens/reextract for a single session.
 * Returns { ok, status, body }.
 */
export async function reextractTokens(sessionId, rawJsonl, timeoutMs = 30000) {
  const apiUrl = getApiUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/analytics/tokens/reextract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, raw_jsonl: rawJsonl }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw err;
  }
}

/**
 * Create a POST function for /ingest with the given timeout.
 * @param {number} timeoutMs
 * @returns {async function(payload): { ok, status, body }}
 */
export function makePostFn(timeoutMs = 30000) {
  const apiUrl = getApiUrl();

  return async function postIngest(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${apiUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.text().catch(() => '');
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  };
}
