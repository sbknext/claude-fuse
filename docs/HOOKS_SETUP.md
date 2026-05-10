# Hooks Setup

claude-fuse can capture sessions live via Claude Code hooks. The installer **merges** entries into your existing `~/.claude/settings.json` — it never clobbers your own hooks.

## Install

```bash
cd claude-fuse
node collector/bin/claude-fuse-collector.js install
```

What it does:
1. Backs up `~/.claude/settings.json` to `~/.claude/settings.json.claude-fuse.bak` (first run only).
2. Reads existing JSON safely (treats missing file as `{}`).
3. Adds 4 hook entries tagged `_managed_by: "claude-fuse"`:
   - `PreToolUse`
   - `PostToolUse`
   - `UserPromptSubmit`
   - `Stop` (Claude Code's session-end lifecycle event)
4. Each entry runs `node {abs-path}/collector/bin/claude-fuse-hook.js {event-name}`.
5. Atomic write (`.tmp` + rename).

Re-running `install` produces zero diff. The `_managed_by` tag is the idempotency key.

## Uninstall

```bash
node collector/bin/claude-fuse-collector.js uninstall
```

Removes only entries tagged `_managed_by: "claude-fuse"`. If a backup exists and the file matches the post-install state, restores from backup.

## Hook behaviour

`claude-fuse-hook.js` is **fire-and-forget**:

- HTTP timeout: 500ms.
- On timeout / connection refused / non-2xx: writes the payload to `~/.claude-fuse/queue/{ts}-{nonce}.json` and exits 0.
- Never blocks Claude Code. Worst case adds <1s to a tool call.

## Drain the queue

If the api was down while hooks fired, drain the queue once api is back:

```bash
node collector/bin/claude-fuse-collector.js flush-queue
```

## Verify

After install, run a tool in a Claude Code session, then:

```bash
curl -s http://localhost:5457/sessions | jq '.sessions[0]'
```

You should see your live session.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `install` fails on JSON parse | Check `~/.claude/settings.json` for valid JSON; restore from `.bak` if needed |
| Hooks fire but nothing in api | Confirm api running on `:5457` and `CLAUDE_FUSE_API_URL` matches |
| Queue files piling up | Api is down or unreachable — start it, then `flush-queue` |
| Want to disable temporarily | `uninstall` then `install` again later |

## Required reading before editing the installer

`claude-fuse/.bmad/stories/1.2-collector-hooks.md` — settings.json merge contract, idempotency rules, atomic-write requirements. The installer is the only piece of claude-fuse that writes outside the project, so it has the strictest test bar.
