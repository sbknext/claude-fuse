/**
 * src/batcher.js
 *
 * Accumulates events and flushes in batches:
 *   - max 500 events per batch
 *   - max ~1MB payload per batch
 * Retries with exponential backoff up to 3 times on failure.
 * Surfaces failures in a summary returned by flush().
 */

const MAX_EVENTS = 500;
const MAX_BYTES = 1_000_000; // ~1MB

/**
 * Estimate serialized size of a payload object.
 */
function estimateBytes(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

/**
 * Split a list of events into chunks respecting size/count limits.
 * Returns array of event arrays.
 */
export function chunkEvents(events) {
  const chunks = [];
  let current = [];
  let currentBytes = 0;

  for (const evt of events) {
    const evtBytes = Buffer.byteLength(JSON.stringify(evt), 'utf8') + 1;
    const wouldExceed =
      current.length >= MAX_EVENTS || currentBytes + evtBytes > MAX_BYTES;

    if (wouldExceed && current.length > 0) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(evt);
    currentBytes += evtBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * POST a single batch payload to the API with exponential backoff.
 * postFn: async (payload) => { ok, status, body }
 * Returns { ok: boolean, attempts: number, error?: string }
 */
export async function postWithRetry(postFn, payload, maxRetries = 3) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const result = await postFn(payload);
      if (result.ok) return { ok: true, attempts: attempt };
      lastError = `HTTP ${result.status}: ${result.body}`;
    } catch (err) {
      lastError = err.message || String(err);
    }

    if (attempt < maxRetries) {
      const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await sleep(backoffMs);
    }
  }

  return { ok: false, attempts: attempt, error: lastError };
}

/**
 * Batch + send a session's events to the API.
 *
 * @param {object} session  — ingest contract session object
 * @param {Array}  events   — ingest contract events
 * @param {string} source   — 'backfill' | 'hook'
 * @param {Function} postFn — async (payload) => { ok, status, body }
 * @param {string[]} rawLines — optional raw JSONL lines for raw_jsonl_chunk
 * @returns {object} summary: { batches, eventsTotal, errors[] }
 */
export async function batchAndSend(session, events, source, postFn, rawLines = []) {
  const chunks = chunkEvents(events);
  const summary = { batches: chunks.length, eventsTotal: events.length, errors: [] };

  // Map each chunk index to the corresponding raw lines slice (proportional)
  const totalEvents = events.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Include raw lines only in the first chunk (keep payload manageable)
    const rawChunk = i === 0 && rawLines.length > 0
      ? rawLines.slice(0, Math.min(rawLines.length, 500)).join('\n')
      : undefined;

    const payload = {
      source,
      session,
      events: chunk,
      ...(rawChunk !== undefined ? { raw_jsonl_chunk: rawChunk } : {}),
    };

    const result = await postWithRetry(postFn, payload);
    if (!result.ok) {
      summary.errors.push({
        batch: i + 1,
        error: result.error,
        attempts: result.attempts,
        eventCount: chunk.length,
      });
    }
  }

  return summary;
}
