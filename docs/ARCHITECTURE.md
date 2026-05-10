# claude-fuse — Architecture

## Layers

```
┌────────────────────────────────────────────────────────────────────┐
│  Capture                                                            │
│  ┌────────────────────────┐    ┌──────────────────────────────────┐ │
│  │ JSONL backfill         │    │ Live hooks (settings.json)       │ │
│  │ ~/.claude/projects/*   │    │ PreToolUse / PostToolUse /       │ │
│  │ → claude-fuse-backfill │    │ UserPromptSubmit / Stop          │ │
│  └────────────┬───────────┘    └──────────────────┬───────────────┘ │
│               │                                   │                 │
│               └───────────────┬───────────────────┘                 │
│                               ▼                                     │
│                 collector batcher (≤500 events / 1MB)               │
│                       fire-and-forget POST                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  api  (Express on :5457)                                            │
│  POST /ingest                                                       │
│   ├─ upsert sessions                                                │
│   ├─ insert events (db.transaction)                                 │
│   ├─ append raw JSONL to data/sessions/YYYY-MM-DD/{id}.jsonl        │
│   ├─ run 5 detectors over affected window                           │
│   └─ run n-gram analyzer (3..6-grams, sha256 sig)                   │
│  GET  /sessions, /sessions/:id                                      │
│  GET  /mistakes, POST /mistakes/:id/promote → MISTAKES_LEDGER.md    │
│  GET  /skills,   POST /skills/:id/promote                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  Storage (hybrid)                                                   │
│  ┌───────────────────────────┐   ┌──────────────────────────────┐   │
│  │ SQLite (better-sqlite3)   │   │ raw JSONL on disk            │   │
│  │ data/metadata.db          │   │ data/sessions/YYYY-MM-DD/    │   │
│  │ tables: sessions, events, │   │ pointers via                 │   │
│  │ mistakes, skill_cands,    │   │ events.jsonl_offset          │   │
│  │ schema_version            │   │                              │   │
│  └───────────────────────────┘   └──────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  dashboard  (Next.js 15 on :5460)                                   │
│  /  · /sessions/[id] · /mistakes · /skills                          │
│  Promote-to-MISTAKES_LEDGER on mistakes feed                        │
│  Promote-to-skill on skill candidates                               │
└────────────────────────────────────────────────────────────────────┘
```

## Why hybrid storage

SQLite metadata answers "give me sessions where mistake_count > 0 in the last week" in <10ms over 10k events. Raw JSONL on disk preserves the full payload (assistant text, tool input/output) without bloating the queryable index. `events.jsonl_offset` points to the byte location for full-payload reads.

## Detector contract

Each detector lives in `api/src/detectors/{pattern}.js` and exports:

```js
export function detect(events, session) {
  // events: array of event rows for the session window
  // session: session row
  // returns: array of mistake rows { pattern, severity, event_id, details_json }
}
```

Detectors run synchronously inside `db.transaction()` after each ingest. Cheap operations only — Levenshtein, regex, time-window grouping. No embeddings.

## N-gram analyzer

Per session: build ordered `tool_name[]`. Slide windows of size 3..6. For each window, compute `sha256(JSON.stringify(seq))`. Upsert into `skill_candidates` (increment frequency, append session id, update last_seen). Threshold flag (frequency≥5 AND distinct sessions≥3) is a query-time concern, not a write-time mutation.

## Promote-to-ledger

`POST /mistakes/:id/promote`:
1. Read `CLAUDE_FUSE_LEDGER_PATH` (default `../MISTAKES_LEDGER.md` from api dir).
2. Grep `^## M(\d+)` headers, take max+1.
3. Append a templated entry (pattern, severity, session, event, details).
4. Set `mistakes.ledger_entry_id = 'M{n+1}'`, `reviewed = 1`.
5. Return `{ success, ledger_entry_id, mistake }`.

This is the only write to a Brain-repo-owned file made by the api.

## Boundaries

| Workspace      | Owns                                  | Never touches                        |
|----------------|---------------------------------------|--------------------------------------|
| `api/`         | data/metadata.db, data/sessions/, ledger via env | collector/, dashboard/   |
| `collector/`   | ~/.claude-fuse/queue/, ~/.claude/settings.json (only on `install`) | api/, dashboard/ |
| `dashboard/`   | nothing on disk (read-only ui)        | api/, collector/                     |

## Phase 2+ deferred

- Embeddings + semantic skill clustering.
- Cost dashboard.
- Session replay timeline scrubber.
- Multi-user auth (currently `user='sambhaji'` hardcoded).
- Langfuse cross-link.
- DigitalOcean deploy.
