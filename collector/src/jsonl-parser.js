/**
 * src/jsonl-parser.js
 *
 * Streaming JSONL parser for Claude Code session files.
 * Emits { session, events[] } per file.
 * Does NOT read whole file into memory — uses readline over createReadStream.
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import crypto from 'crypto';

/**
 * Derive a project name from the directory path.
 * ~/.claude/projects/-Users-sam-Documents-saas-brain-...
 * → strip leading '-', replace dashes used as path separators.
 * Convention: last UUID-shaped segment is the session id, not part of project.
 */
export function dirToProject(dirPath) {
  const base = path.basename(dirPath);
  // Strip leading dash, replace dashes→slashes, normalize
  const stripped = base.replace(/^-/, '').replace(/-/g, '/');
  // Remove trailing UUID-like segments: 8-4-4-4-12
  const uuidPattern = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return stripped.replace(uuidPattern, '');
}

/**
 * Parse ISO-like or relative date string to ms-since-epoch.
 * Accepts: '30d', '7d', '24h', '2026-04-01'
 */
export function parseSince(since) {
  const now = Date.now();
  const relMatch = since.match(/^(\d+)(d|h)$/i);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const ms = unit === 'd' ? n * 86400000 : n * 3600000;
    return now - ms;
  }
  const ts = Date.parse(since);
  if (!isNaN(ts)) return ts;
  throw new Error(`Invalid --since value: "${since}". Use 30d / 7d / 24h / ISO date.`);
}

/**
 * Classify a raw JSONL line object into the ingest contract event type.
 * Returns null if the line should be skipped (not an event we track).
 */
export function classifyLine(obj) {
  const type = obj.type;

  // user message
  if (type === 'user') {
    const msg = obj.message || {};
    const content = msg.content;
    let summary = '';
    if (typeof content === 'string') {
      summary = content.slice(0, 120);
    } else if (Array.isArray(content)) {
      const textPart = content.find(c => c.type === 'text');
      summary = textPart ? String(textPart.text || '').slice(0, 120) : '';
    }
    return {
      type: 'user_msg',
      tool_name: null,
      summary,
    };
  }

  // assistant message — may contain tool_use blocks
  if (type === 'assistant') {
    const msg = obj.message || {};
    const content = Array.isArray(msg.content) ? msg.content : [];
    const toolUse = content.find(c => c.type === 'tool_use');
    if (toolUse) {
      const input = toolUse.input || {};
      let summary = `${toolUse.name}`;
      if (input.command) summary += `: ${String(input.command).slice(0, 80)}`;
      else if (input.file_path) summary += `: ${input.file_path}`;
      else if (input.query) summary += `: ${String(input.query).slice(0, 80)}`;
      return {
        type: 'tool_use',
        tool_name: toolUse.name || null,
        summary,
      };
    }
    // plain assistant text
    const textPart = content.find(c => c.type === 'text');
    return {
      type: 'assistant_msg',
      tool_name: null,
      summary: textPart ? String(textPart.text || '').slice(0, 120) : '',
    };
  }

  // tool result (system-generated)
  if (type === 'tool_result' || (type === 'system' && obj.subtype === 'tool_result')) {
    return {
      type: 'tool_result',
      tool_name: obj.tool_name || null,
      summary: String(obj.content || '').slice(0, 80),
    };
  }

  return null; // skip queue-operation, attachment, last-prompt, ai-title, custom-title, etc.
}

/**
 * Extract session-level metadata from the JSONL lines array.
 * Tries to find timestamps, model, cost, tokens from assistant messages.
 */
function extractSessionMeta(sessionId, lines, filePath, project) {
  let started_at = null;
  let ended_at = null;
  let total_cost_usd = 0;
  let total_input_tokens = 0;
  let total_output_tokens = 0;

  for (const obj of lines) {
    // timestamps from queue-operation or typed lines
    const ts = obj.timestamp ? Date.parse(obj.timestamp) : null;
    if (ts && !isNaN(ts)) {
      if (started_at === null || ts < started_at) started_at = ts;
      if (ended_at === null || ts > ended_at) ended_at = ts;
    }

    // cost + tokens from assistant usage
    if (obj.type === 'assistant') {
      const usage = (obj.message || {}).usage || {};
      total_input_tokens += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      total_output_tokens += usage.output_tokens || 0;
      // cost approximation not in raw JSONL; leave at 0 unless provided
    }
  }

  if (started_at === null) {
    // fall back to file mtime
    try {
      const stat = fs.statSync(filePath);
      started_at = stat.mtimeMs - 60000; // approx
      ended_at = stat.mtimeMs;
    } catch {
      started_at = Date.now();
      ended_at = Date.now();
    }
  }

  return {
    id: sessionId,
    user: process.env.CLAUDE_FUSE_USER || 'me',
    project,
    branch: null,
    cwd: null,
    started_at,
    ended_at,
    status: 'completed',
    total_cost_usd,
    total_input_tokens,
    total_output_tokens,
    jsonl_path: null, // api will assign
  };
}

/**
 * Extract session ID from JSONL objects.
 * Claude Code embeds sessionId in most record types.
 * Falls back to filename stem if not found.
 */
function extractSessionId(objects, fileNameStem) {
  for (const { obj } of objects) {
    const sid = obj.sessionId || obj.session_id;
    if (sid && typeof sid === 'string' && sid.length > 8) {
      return sid;
    }
  }
  return fileNameStem;
}

/**
 * Parse a single JSONL file, streaming line by line.
 * Returns Promise<{ session, events, rawLines }> where:
 *   session — matches ingest contract session shape
 *   events  — array of ingest contract event objects
 *   rawLines — array of raw line strings (for raw_jsonl_chunk)
 */
export async function parseFile(filePath, projectDir) {
  const fileNameStem = path.basename(filePath, '.jsonl');
  const project = dirToProject(projectDir || path.dirname(filePath));

  const objects = [];
  const rawLines = [];
  let offset = 0;

  await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      rawLines.push(line);
      const lineOffset = offset;
      offset += Buffer.byteLength(line, 'utf8') + 1; // +1 for newline
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        objects.push({ obj, lineOffset });
      } catch {
        // malformed line — skip + log
        process.stderr.write(`[jsonl-parser] skipping malformed line in ${path.basename(filePath)}\n`);
      }
    });

    rl.on('close', resolve);
    rl.on('error', reject);
  });

  // Extract session ID from content, fall back to filename stem
  const sessionId = extractSessionId(objects, fileNameStem);

  // Build session metadata
  const session = extractSessionMeta(
    sessionId,
    objects.map(o => o.obj),
    filePath,
    project
  );

  // Build events
  const events = [];
  let prevTs = session.started_at;

  for (const { obj, lineOffset } of objects) {
    const classified = classifyLine(obj);
    if (!classified) continue;

    // Derive timestamp: prefer obj.timestamp, else obj.message.created_at, else increment from prev
    let ts = null;
    if (obj.timestamp) ts = Date.parse(obj.timestamp);
    if (!ts || isNaN(ts)) {
      const createdAt = (obj.message || {}).created_at;
      if (createdAt) ts = typeof createdAt === 'number' ? createdAt * 1000 : Date.parse(createdAt);
    }
    if (!ts || isNaN(ts)) {
      ts = prevTs + 100; // synthetic monotonic increment
    }
    prevTs = ts;

    events.push({
      ts,
      type: classified.type,
      tool_name: classified.tool_name,
      summary: classified.summary,
      duration_ms: null,
      success: null,
      jsonl_offset: lineOffset,
    });
  }

  // Update session total_tool_calls
  session.total_tool_calls = events.filter(e => e.type === 'tool_use').length;

  return { session, events, rawLines };
}

/**
 * Scan a project directory for JSONL session files modified after `sinceMs`.
 * Returns an async generator yielding { filePath, projectDir } per file.
 */
export async function* scanProjectDir(projectDir, sinceMs) {
  let entries;
  try {
    entries = fs.readdirSync(projectDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const filePath = path.join(projectDir, entry);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs >= sinceMs) {
        yield { filePath, projectDir };
      }
    } catch {
      // skip unreadable
    }
  }
}

/**
 * Scan all ~/.claude/projects/-Users-sam-* directories.
 * Returns async generator yielding { filePath, projectDir }.
 */
export async function* scanAllProjects(claudeProjectsDir, sinceMs) {
  let dirs;
  try {
    dirs = fs.readdirSync(claudeProjectsDir);
  } catch {
    return;
  }
  for (const dir of dirs) {
    if (!dir.startsWith('-Users-sam-')) continue;
    const projectDir = path.join(claudeProjectsDir, dir);
    const stat = fs.statSync(projectDir);
    if (!stat.isDirectory()) continue;
    yield* scanProjectDir(projectDir, sinceMs);
  }
}
