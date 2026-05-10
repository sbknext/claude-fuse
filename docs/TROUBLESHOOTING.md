# Troubleshooting

## a. Port 5457 or 5460 already in use

```bash
# Find the process holding the port
lsof -i :5457
lsof -i :5460

# Kill it, or override the port via env
CLAUDE_FUSE_API_PORT=5458 npm run dev:api
# For the dashboard, pass -p directly:
npm run -w dashboard dev -- -p 5461
```

Set `CLAUDE_FUSE_API_PORT` persistently in `api/.env` and `NEXT_PUBLIC_CLAUDE_FUSE_API_URL` in `dashboard/.env.local` to match.

---

## b. `npm install` fails on `better-sqlite3` build (node-gyp / Python / Xcode)

`better-sqlite3` compiles a native C++ addon. Build tools must be present.

```bash
# macOS
xcode-select --install

# Linux (Debian/Ubuntu)
sudo apt-get install build-essential python3

# If you upgraded Node and bindings are stale:
npm rebuild better-sqlite3
```

Python 3 must be on `PATH` as `python3` (or `python`). Node 20+ required.

---

## c. Backfill reports 0 events

Claude Code stores sessions under `~/.claude/projects/` using path-encoded directory names (e.g. `-Users-sam-Documents-saas-myproject`).

```bash
# Confirm the directory exists and has JSONL files
ls ~/.claude/projects/

# Check for files in a specific project dir
ls ~/.claude/projects/-Users-*/
```

If the directory is empty, you may be on an older Claude Code version that stores sessions elsewhere, or you haven't run any sessions yet. The `--projects-dir` flag overrides the default:

```bash
npm run backfill -- --since 30d --projects-dir /path/to/projects
```

---

## d. Dashboard renders empty after backfill

Two most likely causes:

```bash
# 1. Verify the api is running and has data
curl http://localhost:5457/sessions

# 2. Check the dashboard env var
cat dashboard/.env.local
# Should contain:
# NEXT_PUBLIC_CLAUDE_FUSE_API_URL=http://localhost:5457
```

If `curl` returns sessions but the dashboard is blank, the env var is wrong or the dashboard wasn't restarted after you set it. `NEXT_PUBLIC_*` vars are baked in at dev-server start time — restart `npm run dev:dashboard` after changing them.

---

## e. Hook installer says "no settings.json"

This is harmless. On first install, Claude Code may not yet have created `~/.claude/settings.json`. The installer treats a missing file as `{}` and creates a fresh one.

```bash
# Verify the result
cat ~/.claude/settings.json | jq .hooks
```

You should see four hook entries tagged `_managed_by: "claude-fuse"`. If `jq` is not installed, use `python3 -m json.tool ~/.claude/settings.json`.

---

## f. Promote button does nothing

The Promote button calls `POST /mistakes/:id/promote`, which writes to the file at `CLAUDE_FUSE_LEDGER_PATH`.

```bash
# 1. Check the env var is set in api/.env
grep LEDGER api/.env

# 2. Confirm the file exists and is writable
ls -la "$(grep LEDGER api/.env | cut -d= -f2)"
chmod 644 /path/to/MISTAKES_LEDGER.md
```

If `CLAUDE_FUSE_LEDGER_PATH` is unset, the api defaults to `../../MISTAKES_LEDGER.md` relative to the `api/` directory. Set it explicitly in `api/.env`:

```
CLAUDE_FUSE_LEDGER_PATH=/absolute/path/to/MISTAKES_LEDGER.md
```

---

## Still stuck?

Open a discussion at **https://github.com/sbknext/claude-fuse/discussions** — include your Node version, OS, and the exact error output.
