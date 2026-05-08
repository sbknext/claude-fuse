# @claude-fuse/api

Express + better-sqlite3 ingestion and detection backend for claude-fuse.  
Port: **5457** (env `CLAUDE_FUSE_API_PORT`).

---

## Quick start

```bash
# From the claude-fuse/ workspace root:
npm run migrate        # create data/metadata.db (idempotent)
npm run dev:api        # start Express on :5457
```

Or from this directory:

```bash
node src/migrations/run.js
node src/server.js
```

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CLAUDE_FUSE_API_PORT` | `5457` | HTTP listen port |
| `CLAUDE_FUSE_DB` | `./data/metadata.db` | SQLite file path |
| `CLAUDE_FUSE_SESSIONS_DIR` | `./data/sessions` | Root for raw JSONL files |
| `CLAUDE_FUSE_LEDGER_PATH` | `../../MISTAKES_LEDGER.md` | Promote target (brain repo) |
| `CLAUDE_FUSE_NO_LISTEN` | (unset) | Set to `1` to skip `app.listen` (tests) |

Copy `.env.example` to `.env` and edit as needed.

---

## Scripts

| Script | Command |
|---|---|
| `npm run dev` | Start Express server |
| `npm run migrate` | Apply schema migrations (idempotent) |
| `npm test` | Run vitest with v8 coverage |

---

## Ingest contract

**`POST /ingest`** — accepts batched events from the collector.

```json
{
  "source": "backfill" | "hook",
  "session": {
    "id": "uuid",
    "user": "sambhaji",
    "project": "brain",
    "branch": "master",
    "cwd": "/Users/sam/...",
    "started_at": 1715260800000,
    "ended_at": null,
    "status": "active" | "completed" | "crashed",
    "total_cost_usd": 0.12,
    "total_input_tokens": 1000,
    "total_output_tokens": 500,
    "total_tool_calls": 10
  },
  "events": [
    {
      "ts": 1715260801000,
      "type": "user_msg" | "assistant_msg" | "tool_use" | "tool_result",
      "tool_name": "Bash" | "Edit" | "Read" | "Grep" | ...,
      "summary": "short label",
      "duration_ms": 120,
      "success": 1 | 0 | null,
      "jsonl_offset": 4096
    }
  ],
  "raw_jsonl_chunk": "<optional newline-delimited raw lines>"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "events_inserted": 50,
  "mistakes_detected": 3,
  "skill_candidates_touched": 42
}
```

After ingestion, all 5 detectors run over the session's event window and any new mistake rows are inserted. The n-gram analyzer updates `skill_candidates`.

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/sessions` | List sessions. Query: `limit=N`, `project=<name>` |
| `GET` | `/sessions/:id` | Session detail with events + mistake list |
| `GET` | `/mistakes` | List mistakes. Query: `reviewed=0`, `pattern=<name>` |
| `POST` | `/mistakes/:id/promote` | Append `M{n+1}` entry to MISTAKES_LEDGER.md |
| `GET` | `/skills` | List skill candidates. Query: `promoted=null` |
| `POST` | `/skills/:id/promote` | Set `promoted_at = now()` |
| `GET` | `/health` | `{ status: "ok" }` |

---

## Detectors (`src/detectors/`)

All detectors are **pure functions**: `detect(events, session) → Array<mistakeRow>`.

| Detector | Trigger | Severity |
|---|---|---|
| `failed_bash_retry` | Bash exit≠0 → Bash within 60s with Levenshtein ratio <0.3 | medium |
| `edit_rollback` | Edit file X → Edit same X within 120s with <50% content preserved | medium |
| `user_halt` | User issued a halt/why interrupt; matches `stop`, `wait`, `why`, plus Hindi `kyu`, `nahi`, `ruk` (bilingual matching) | high |
| `panic_reset` | `git reset --hard` or `git checkout .` within 5min of a commit | high |
| `repeated_grep_read` | 3+ Grep/Read on same file within 2 minutes | low |

---

## N-gram analyzer (`src/analyzers/skill_ngram.js`)

Sliding window 3–6-gram over the tool_name sequence per session.  
Each gram is hashed to a sha256 signature and upserted into `skill_candidates`.  
Rows with `frequency ≥ 5 AND distinct_sessions ≥ 3` are eligible for promotion.

---

## Schema

5 tables in `data/metadata.db`: `sessions`, `events`, `mistakes`, `skill_candidates`, `schema_version`.  
Full DDL: `src/migrations/001_initial.sql`.

---

## Promote-to-ledger format

`POST /mistakes/:id/promote` appends to `MISTAKES_LEDGER.md`:

```
## M{n+1} — {pattern} in session {short-id} ({YYYY-MM-DD})

**Severity:** {severity}
**Auto-detected by:** claude-fuse {pattern}
**Session:** `{session-id}` (project: {project}, branch: {branch})
**Event:** {event_id} at {ts ISO}
**Details:** {details summary}

(Promoted from claude-fuse dashboard on {YYYY-MM-DD HH:MM}.)
```

`n+1` is determined by grepping `^## M(\d+)` headers in the ledger file and taking `max + 1`.
