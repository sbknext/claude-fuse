#!/usr/bin/env node
/**
 * bin/claude-fuse-hook.js <event-name>
 *
 * Invoked by Claude Code hooks. Reads JSON payload from stdin,
 * normalises it to the ingest contract, POSTs to :5457/ingest.
 *
 * HARD RULES:
 *   - Timeout 500ms. Must not block Claude Code.
 *   - On timeout / connection refused: write to local queue, exit 0.
 *   - Never throw — always exit 0.
 */

import os from 'os';
import path from 'path';
import { makePostFn } from '../src/api-client.js';
import { enqueue, getQueueDir } from '../src/queue.js';

const eventName = process.argv[2] || 'unknown';

async function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { buf += d; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
    // Safety: if stdin never ends, resolve after 300ms
    setTimeout(() => resolve(buf), 300);
  });
}

function normalizePayload(eventName, rawInput) {
  let hookData = {};
  try {
    hookData = JSON.parse(rawInput || '{}');
  } catch {
    // unparseable stdin — use empty object
  }

  // Derive session id from hook payload (Claude Code passes session_id in hook context)
  const sessionId =
    hookData.session_id ||
    hookData.sessionId ||
    `hook-${Date.now()}`;

  // Map event name to ingest event type
  const typeMap = {
    PreToolUse:        'tool_use',
    PostToolUse:       'tool_result',
    UserPromptSubmit:  'user_msg',
    Stop:              'assistant_msg',
  };
  const type = typeMap[eventName] || 'tool_use';

  // Extract tool name and summary from hook payload
  const toolName = hookData.tool_name || hookData.toolName || null;
  let summary = '';
  if (hookData.tool_input?.command) summary = String(hookData.tool_input.command).slice(0, 120);
  else if (hookData.tool_input?.file_path) summary = hookData.tool_input.file_path;
  else if (hookData.prompt) summary = String(hookData.prompt).slice(0, 120);
  else summary = eventName;

  const now = Date.now();

  const session = {
    id: sessionId,
    user: process.env.CLAUDE_FUSE_USER || 'me',
    project: hookData.project || null,
    branch: hookData.branch || null,
    cwd: hookData.cwd || null,
    started_at: now,
    ended_at: null,
    status: 'active',
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    jsonl_path: null,
  };

  const event = {
    ts: now,
    type,
    tool_name: toolName,
    summary,
    duration_ms: hookData.duration_ms || null,
    success: hookData.success !== undefined ? (hookData.success ? 1 : 0) : null,
    jsonl_offset: null,
  };

  return {
    source: 'hook',
    session,
    events: [event],
  };
}

async function main() {
  const rawInput = await readStdin();
  const payload = normalizePayload(eventName, rawInput);

  const postFn = makePostFn(500); // 500ms hard timeout

  try {
    const result = await postFn(payload);
    if (!result.ok) {
      // Non-2xx: queue locally
      const queueDir = getQueueDir();
      enqueue(payload, queueDir);
    }
  } catch {
    // Timeout or connection refused: queue locally
    const queueDir = getQueueDir();
    try {
      enqueue(payload, queueDir);
    } catch {
      // Can't even queue — silently ignore. Never block Claude Code.
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // NEVER exit non-zero from hook script
