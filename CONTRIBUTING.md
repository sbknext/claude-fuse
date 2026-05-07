# Contributing to claude-fuse

Thanks for considering a contribution! claude-fuse is a small, opinionated tool — keep changes focused and well-tested.

## Development setup

```bash
git clone https://github.com/sbkolate/claude-fuse.git
cd claude-fuse
cp .env.example .env
npm install
npm run migrate
npm run dev:api &
npm run dev:dashboard &
npm run backfill -- --since 30d
open http://localhost:5460
```

Node 20+ required. Single-user, local-only — no auth, no remote.

## Workspace layout

| Workspace | Purpose | Tests |
|---|---|---|
| `api/` | Express + SQLite, ingest, detectors, n-gram analyzer | `npm test -w api` |
| `collector/` | JSONL parser, backfill CLI, hook installer | `npm test -w collector` |
| `dashboard/` | Next.js 15 UI | `npm test -w dashboard` + `npm run build -w dashboard` |

**Boundary rule:** code in one workspace must not import from another. They communicate via the HTTP api contract documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Pull request checklist

- [ ] Tests added/updated for the change.
- [ ] `npm test` passes across all 3 workspaces.
- [ ] If touching `dashboard/`: `npm run build -w dashboard` is green.
- [ ] If adding a detector: include positive + negative fixture cases.
- [ ] If touching the hook installer: run the idempotency test against a tmp settings.json fixture (never touch the real `~/.claude/settings.json` from a test).
- [ ] Commit message follows `feat(<scope>): ...` / `fix(<scope>): ...` / `docs(<scope>): ...` style.

## Adding a detector

1. Create `api/src/detectors/{pattern}.js` exporting `detect(events, session)`.
2. Register it in `api/src/detectors/index.js`.
3. Add fixtures in `api/tests/fixtures/events.js` and tests in `api/tests/detectors.test.js`.
4. Update [`README.md`](README.md) detector table and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Reporting bugs

Use the bug report template in `.github/ISSUE_TEMPLATE/`. Include:
- claude-fuse version (commit sha or release tag).
- Node version.
- Steps to reproduce.
- Expected vs actual behaviour.
- Sanitised JSONL excerpt if the bug is parser-related (strip session content first).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
