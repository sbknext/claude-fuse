# claude-fuse dashboard

Next.js 15 (App Router) observability dashboard for Claude Code sessions.

## Start

```bash
# From the claude-fuse workspace root:
npm run dev:dashboard

# Or directly:
cd dashboard && npm run dev
```

Runs on **http://localhost:5460**.

## Environment variable

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLAUDE_FUSE_API_URL` | `http://localhost:5457` | Base URL for the claude-fuse api |

Set it in `dashboard/.env.local` if the api runs on a different host/port.

## Pages

| Path | Description |
|---|---|
| `/` | Recent sessions table — ID, project, branch, started, tool calls, mistake count, status |
| `/sessions/[id]` | Session detail — header stats + full chronological event timeline with inline mistake annotations |
| `/mistakes` | Mistake feed grouped by pattern, filterable by `?reviewed=0\|1` and `?severity=low\|medium\|high`. Each card has a "Promote to MISTAKES_LEDGER" button |
| `/skills` | Skill candidates sorted by frequency desc. Each card has an inline "Promote" form (name + description required) |

## Dark mode

Toggle lives top-right. Default = light. Preference persists to `localStorage` under key `claude-fuse-theme`. Implemented via Tailwind `class` strategy — adds/removes `dark` class on `<html>`.

## Empty states

When the api is offline or returns no data, every list page renders a "No data yet — run backfill" message with the backfill command. No console errors, no thrown render errors.

## Build

```bash
npm run build   # must exit 0 (R22 gate)
npm test        # 12 vitest smoke tests
```

## Scripts

| Script | Command |
|---|---|
| `dev` | `next dev -p 5460` |
| `build` | `next build` |
| `start` | `next start -p 5460` |
| `lint` | `next lint` |
| `test` | `vitest run` |
