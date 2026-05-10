# FAQ

## How is this different from Langfuse / Helicone / OpenLLMetry?

Langfuse, Helicone, and OpenLLMetry instrument **LLM API calls** — they capture every `POST /v1/messages` with token counts, latencies, and costs. They're great for production observability of AI-powered apps.

claude-fuse tracks **Claude Code sessions** — the full loop of prompts, tool calls, file edits, and outcomes inside a developer workflow. It doesn't touch the LLM API at all; it reads Claude Code's own JSONL session files and live hooks. Different substrate, different use case, complementary to the others.

---

## Does my session data leave my machine?

No. claude-fuse is local-only. The api runs on `localhost:5457`, the dashboard on `localhost:5460`, and the SQLite database lives at `data/metadata.db` in the project directory. No telemetry, no external endpoints, no accounts.

---

## Can I use it without installing the live hook?

Yes. The hook is optional. Run `npm run backfill -- --since 30d` to ingest existing sessions from `~/.claude/projects/`. You'll get full mistake detection and skill discovery from historical data immediately, with no changes to your Claude Code settings.

The live hook adds real-time capture so new sessions appear as they happen. It's additive and can be installed or removed at any time.

---

## Will this slow down Claude Code?

No. The hook script (`claude-fuse-hook.js`) is fire-and-forget with a 500 ms hard timeout. If the api is down or slow, the payload is written to a local queue and the hook exits 0 immediately. Claude Code never waits on claude-fuse.

---

## How do I export my data?

`data/metadata.db` is a plain SQLite file — open it with any SQLite client:

```bash
# CLI
sqlite3 data/metadata.db "SELECT * FROM mistakes ORDER BY created_at DESC LIMIT 10;"

# GUI: TablePlus, DB Browser for SQLite, etc.
open data/metadata.db

# Export to CSV
sqlite3 -csv data/metadata.db "SELECT * FROM sessions;" > sessions.csv
```

Raw session JSONL (full payloads) lives in `data/sessions/YYYY-MM-DD/`. No proprietary format anywhere.
