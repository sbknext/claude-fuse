# Backfill Guide

`claude-fuse-backfill` ingests existing Claude Code session JSONL files from `~/.claude/projects/`. Use it for first-time bootstrap or whenever the live capture path missed events.

## Run

```bash
cd claude-fuse
npm run dev:api &              # api on :5457
npm run backfill -- --since 7d
```

`--since` accepts:
- `30d`, `7d`, `24h`, etc. (relative duration)
- `2026-04-01` or full ISO timestamp (absolute)

## Dry run

```bash
npm run backfill -- --since 7d --dry-run
```

Prints the file list and event counts that *would* be sent, without POSTing anything.

## What gets ingested

For each JSONL file under `~/.claude/projects/-Users-sam-*/`:
- The session id (from JSONL content; falls back to filename UUID).
- Session metadata: `started_at`, `ended_at`, `total_tool_calls`, `total_input_tokens`, `total_output_tokens`, `cwd`, `project`.
- Every line in the file as one event (typed as `user_msg`, `assistant_msg`, `tool_use`, `tool_result`).
- Raw JSONL appended to `claude-fuse/data/sessions/YYYY-MM-DD/{session-id}.jsonl`.

After ingest, the api runs all 5 detectors and the n-gram analyzer over the affected sessions.

## Throughput

Empirical: 26 files / 10,640 events ingest in ~3 seconds on an M-series Mac. Batches are capped at 500 events / ~1MB, with retry on failure.

## When to re-run

- After upgrading detectors or analyzer in the api: clear `data/metadata.db` and re-ingest, OR add a re-run button in the dashboard (Phase 2 candidate).
- After running Claude Code without the live hook installed: backfill since the last successful live capture.

## Limitations (Phase 1)

- No deduplication: re-ingesting the same JSONL produces duplicate event rows. Wipe `data/metadata.db` and re-run for a clean slate. Phase 2 will track ingested file checksums.
- `project` field comes from the directory name encoding. Exotic project paths render as path-segment strings; a normalizer is on the Phase 2 list.
- `branch` and `cwd` are extracted from JSONL content where present; otherwise null.

## Required reading before editing the backfill CLI

`claude-fuse/.bmad/stories/1.2-collector-hooks.md` — `--since` parsing rules, batch size cap, retry policy.
