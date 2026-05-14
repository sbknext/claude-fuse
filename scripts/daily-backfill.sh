#!/bin/sh
# claude-fuse daily backfill — runs once a day via launchd
set -e
cd "$HOME/Documents/saas/claude-fuse-fresh"
LOG="$HOME/.claude-fuse/backfill.log"
echo "[$(date -u +%FT%TZ)] start" >> "$LOG"
# ensure api is up
if ! curl -sS -o /dev/null -m 2 http://localhost:5457/sessions 2>/dev/null; then
  echo "[$(date -u +%FT%TZ)] api down, starting" >> "$LOG"
  nohup node api/src/server.js >> "$HOME/.claude-fuse/api.log" 2>&1 &
  sleep 4
fi
# Use system node directly
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node collector/bin/claude-fuse-backfill.js --since 30h >> "$LOG" 2>&1 || echo "[$(date -u +%FT%TZ)] backfill failed exit=$?" >> "$LOG"
echo "[$(date -u +%FT%TZ)] done" >> "$LOG"
