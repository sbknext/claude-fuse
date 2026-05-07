# claude-fuse — agent context

## What this is
Local-first observability layer for Claude Code sessions. Tracks every prompt + tool call + file edit. Auto-detects mistake patterns and repeated skills.

## Required reading before code edits
1. [`README.md`](README.md) — install, run, the 5 detection patterns.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layer diagram, storage rationale, detector contract.
3. [`docs/HOOKS_SETUP.md`](docs/HOOKS_SETUP.md) — settings.json merge semantics; the installer is the only piece that writes outside the project.
4. [`docs/BACKFILL_GUIDE.md`](docs/BACKFILL_GUIDE.md) — `--since` semantics, throughput, dedup limits.
5. [`CONTRIBUTING.md`](CONTRIBUTING.md) — workspace boundary rule, PR checklist, how to add a detector.

## Hard rules
- **Workspace boundaries are immutable.** Code in `api/` never imports from `collector/` or `dashboard/`. Same for the others. They communicate only via the HTTP api contract documented in ARCHITECTURE.md.
- **Hook installer must MERGE** into `~/.claude/settings.json`, never clobber. Read-merge-write, atomic, idempotent. Tests must use a tmp settings.json fixture, never the real one.
- **Collector must be fire-and-forget.** HTTP timeout ≤500 ms, local queue if api is down. Never block Claude Code.
- **Local build before commit (frontend).** `npm run build -w dashboard` must be green before any commit touching `dashboard/` files. Type errors in CI are not OK if `next build` would have caught them locally.
- **No embeddings in Phase 1.** N-gram + frequency only. Phase 2 adds semantic clustering.
- **Single user.** `user` field hardcoded to `'sambhaji'` in inserts; multi-user lands in Phase 3.

## Ports
- api: `5457`
- dashboard: `5460`

## Storage
- SQLite metadata: `data/metadata.db` (gitignored)
- Raw JSONL: `data/sessions/YYYY-MM-DD/{session-id}.jsonl` (gitignored)
- Promote target: file at `CLAUDE_FUSE_LEDGER_PATH` (default `../MISTAKES_LEDGER.md` resolved from `api/`); gets next `M{n+1}` entry appended on promote.

## Tests
- Vitest in `api/` and `collector/`. Coverage target ≥80% on detectors + analyzer + parser.
- Dashboard: vitest + RTL smoke + `next build` green.
