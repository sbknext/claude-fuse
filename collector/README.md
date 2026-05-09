# claude-fuse-collector

Capture layer for claude-fuse. Three CLI entry points feed session data into the api at `:5457`.

---

## CLIs

### `node bin/claude-fuse-backfill.js`

Scans `~/.claude/projects/-Users-sam-*/` for JSONL session files, parses them line-by-line, and batches POST requests to `:5457/ingest`.

```bash
node bin/claude-fuse-backfill.js --since 30d
node bin/claude-fuse-backfill.js --since 7d --dry-run
node bin/claude-fuse-backfill.js --since 2026-04-01
```

Flags:
- `--since <period>` — how far back to scan. Accepts `30d`, `7d`, `24h`, or ISO date (e.g. `2026-04-01`). Default: `30d`.
- `--dry-run` — print plan without POSTing.
- `--projects-dir <dir>` — override `~/.claude/projects` directory (default: `~/.claude/projects`).

Batching: ≤500 events / ~1MB per POST. Retries up to 3× with exponential backoff (1s, 2s, 4s). Errors printed to stdout as part of summary.

---

### `node bin/claude-fuse-hook.js <event-name>`

Reads Claude Code hook JSON payload from stdin, normalises it to the ingest contract, and POSTs a single-event batch to `:5457/ingest`.

```bash
echo '{"session_id":"abc","tool_name":"Bash"}' | node bin/claude-fuse-hook.js PreToolUse
```

Supported event names: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`.

Hard rules:
- Timeout 500ms. Never blocks Claude Code.
- On timeout / connection refused: writes payload to local queue (`~/.claude-fuse/queue/`), exits 0.
- Always exits 0 — never raises an error to Claude Code.

---

### `node bin/claude-fuse-collector.js [install|uninstall|flush-queue]`

Management CLI.

```bash
# Merge hook entries into ~/.claude/settings.json
node bin/claude-fuse-collector.js install

# Remove only claude-fuse managed entries (restores backup if available)
node bin/claude-fuse-collector.js uninstall

# Drain ~/.claude-fuse/queue/ to the api
node bin/claude-fuse-collector.js flush-queue
```

`install` behaviour:
- Reads existing `~/.claude/settings.json` (or `{}` if absent).
- Creates a backup at `~/.claude/settings.json.claude-fuse.bak` on first run.
- Deep-merges hook entries for `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`.
- Each entry tagged `{ "_managed_by": "claude-fuse" }` for idempotency.
- Atomic write (`.tmp` + rename).
- Re-running = no diff.

`uninstall` behaviour:
- Restores from `.claude-fuse.bak` if available.
- Otherwise surgically removes entries tagged `_managed_by: claude-fuse`.
- Preserves all pre-existing user hooks.

---

## Env vars

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_FUSE_API_URL` | `http://localhost:5457` | API base URL |
| `HOME` | system | Used to locate `~/.claude/settings.json` and `~/.claude-fuse/queue/` |

---

## Queue path

Failed hook deliveries are written to:

```
~/.claude-fuse/queue/{timestamp}-{nonce}.json
```

Each file contains a full ingest contract payload. Drain with `flush-queue`.

---

## Source modules

| Module | Purpose |
|---|---|
| `src/jsonl-parser.js` | Streaming JSONL parser; extracts session metadata + events |
| `src/batcher.js` | Event chunking (500 events / 1MB), retry with backoff |
| `src/api-client.js` | POST /ingest with configurable timeout |
| `src/installer.js` | Read-merge-write settings.json; idempotent; backup |
| `src/queue.js` | Local queue for offline delivery |

---

## Tests

```bash
npm test           # run all tests + coverage
```

Coverage (≥80% on parser + installer):
- `jsonl-parser.js`: 91%
- `installer.js`: 92%
- `batcher.js`: 97%
- `queue.js`: 93%
- `api-client.js`: 95%

Tests use tmp directories for `~/.claude/settings.json` and `~/.claude-fuse/queue/`. The real files are never touched by tests.

---

## Manual test recipe

```bash
# 1. Start the api
cd ../api && npm run dev &

# 2. Install hooks (uses real ~/.claude/settings.json)
node bin/claude-fuse-collector.js install

# 3. Backfill last 7 days (dry-run first)
node bin/claude-fuse-backfill.js --since 7d --dry-run
node bin/claude-fuse-backfill.js --since 7d

# 4. Simulate a hook event
echo '{"session_id":"test-abc","tool_name":"Bash","tool_input":{"command":"ls -la"}}' \
  | node bin/claude-fuse-hook.js PreToolUse

# 5. Check queue (should be empty if api is up)
ls ~/.claude-fuse/queue/

# 6. Flush queue if needed
node bin/claude-fuse-collector.js flush-queue

# 7. Uninstall hooks
node bin/claude-fuse-collector.js uninstall
```
