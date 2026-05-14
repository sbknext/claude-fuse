#!/usr/bin/env node
/**
 * seed-demo.mjs
 * Wipes the local claude-fuse DB and ingests ~8 synthetic demo sessions.
 *
 * Usage:
 *   npm run seed:demo          (via root package.json)
 *   node scripts/seed-demo.mjs
 *
 * Requires API running at http://localhost:5457.
 */

const API = process.env.CLAUDE_FUSE_API_URL || 'http://localhost:5457';

// ─── helpers ──────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** ms offset from now */
function ago(ms) {
  return Date.now() - ms;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

// ─── session blueprints ───────────────────────────────────────────────────────

const SESSIONS = [
  // 1 — demo-app  (user_halt + failed_bash_retry + skill n-gram seed)
  {
    project: 'demo-app',
    branch: 'main',
    startOffset: 2 * HOUR,
    durationMs: 18 * MIN,
    events: [
      { type: 'user_msg',      summary: 'list project files',                  offsetMs: 0 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'ls -la',              offsetMs: 2_000, duration: 80,  success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 2_200, success: true },
      { type: 'tool_use',      tool: 'Read',    summary: 'src/index.ts',        offsetMs: 4_000, duration: 50,  success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'file contents',       offsetMs: 4_100, success: true },
      { type: 'tool_use',      tool: 'Grep',    summary: 'src/index.ts',        offsetMs: 6_000, duration: 40 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'src/index.ts',        offsetMs: 30_000 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'src/index.ts',        offsetMs: 60_000 },
      { type: 'assistant_msg', summary: 'Found the exports. Updating now.',     offsetMs: 65_000 },
      { type: 'user_msg',      summary: 'wait, why are you editing that file?', offsetMs: 70_000 },
      { type: 'assistant_msg', summary: 'Understood — stopping.',               offsetMs: 72_000 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'npm test',            offsetMs: 80_000, duration: 5_000, success: false },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 1',              offsetMs: 85_000, success: false },
      { type: 'tool_use',      tool: 'Bash',    summary: 'npx jest --verbose',  offsetMs: 90_000, duration: 4_500, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 94_500, success: true },
    ],
  },

  // 2 — my-cli (edit_rollback + skill n-gram)
  {
    project: 'my-cli',
    branch: 'feature/login',
    startOffset: 5 * HOUR,
    durationMs: 22 * MIN,
    events: [
      { type: 'user_msg',      summary: 'read main entry',                      offsetMs: 0 },
      { type: 'tool_use',      tool: 'Read',    summary: 'src/main.ts',         offsetMs: 1_000, duration: 45 },
      { type: 'tool_result',   tool: 'Read',    summary: 'file content',        offsetMs: 1_100 },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit src/main.ts add login handler', offsetMs: 5_000, duration: 200, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 5_200, success: true },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit src/main.ts revert handler',   offsetMs: 30_000, duration: 150, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 30_200, success: true },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git diff',            offsetMs: 35_000, duration: 90, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 35_100, success: true },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git commit -m "fix: login"', offsetMs: 40_000, duration: 500, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 40_600, success: true },
    ],
  },

  // 3 — web-store (panic_reset)
  {
    project: 'web-store',
    branch: 'bugfix/auth',
    startOffset: 8 * HOUR,
    durationMs: 30 * MIN,
    events: [
      { type: 'user_msg',      summary: 'commit progress',                       offsetMs: 0 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git add -A',           offsetMs: 2_000, duration: 100, success: true },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git commit -m "wip: auth refactor"', offsetMs: 3_000, duration: 600, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 3_700, success: true },
      { type: 'tool_use',      tool: 'Bash',    summary: 'npm run build',        offsetMs: 10_000, duration: 8_000, success: false },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 1: TypeScript error', offsetMs: 18_000, success: false },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git reset --hard HEAD~1', offsetMs: 20_000, duration: 200, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 20_200, success: true },
      { type: 'assistant_msg', summary: 'Reverted the commit.',                  offsetMs: 22_000 },
    ],
  },

  // 4 — notes-tool (skill n-gram sessions 1/3: Read+Grep+Bash+Edit)
  {
    project: 'notes-tool',
    branch: 'develop',
    startOffset: 12 * HOUR,
    durationMs: 15 * MIN,
    events: [
      { type: 'user_msg',      summary: 'search todos in notes',                offsetMs: 0 },
      { type: 'tool_use',      tool: 'Read',    summary: 'notes/index.md',      offsetMs: 1_000, duration: 40, success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'content',             offsetMs: 1_100 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'TODO notes/index.md', offsetMs: 2_000, duration: 60, success: true },
      { type: 'tool_result',   tool: 'Grep',    summary: '3 matches',           offsetMs: 2_100 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git status',          offsetMs: 3_000, duration: 80, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 3_100 },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit notes/index.md mark todos done', offsetMs: 5_000, duration: 200, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 5_200 },
    ],
  },

  // 5 — cli-utils (skill n-gram sessions 2/3: same Read+Grep+Bash+Edit sequence)
  {
    project: 'cli-utils',
    branch: 'main',
    startOffset: 18 * HOUR,
    durationMs: 14 * MIN,
    events: [
      { type: 'user_msg',      summary: 'check cli entry',                      offsetMs: 0 },
      { type: 'tool_use',      tool: 'Read',    summary: 'cli/entry.ts',        offsetMs: 800, duration: 35, success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'content',             offsetMs: 900 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'process.argv cli/entry.ts', offsetMs: 1_500, duration: 55, success: true },
      { type: 'tool_result',   tool: 'Grep',    summary: '2 matches',           offsetMs: 1_600 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git status',          offsetMs: 2_500, duration: 75, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 2_600 },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit cli/entry.ts add flag parsing', offsetMs: 4_000, duration: 180, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 4_200 },
    ],
  },

  // 6 — learning-tcp (skill n-gram sessions 3/3: same Read+Grep+Bash+Edit)
  {
    project: 'learning-tcp',
    branch: 'main',
    startOffset: 24 * HOUR,
    durationMs: 12 * MIN,
    events: [
      { type: 'user_msg',      summary: 'inspect server code',                  offsetMs: 0 },
      { type: 'tool_use',      tool: 'Read',    summary: 'server.ts',           offsetMs: 700, duration: 30, success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'content',             offsetMs: 800 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'listen server.ts',    offsetMs: 1_200, duration: 50, success: true },
      { type: 'tool_result',   tool: 'Grep',    summary: '1 match',             offsetMs: 1_300 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git status',          offsetMs: 2_000, duration: 70, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 2_100 },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit server.ts add port env var', offsetMs: 3_500, duration: 150, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 3_700 },
    ],
  },

  // 7 — dotfiles (user_halt again + repeated grep)
  {
    project: 'dotfiles',
    branch: 'main',
    startOffset: 30 * HOUR,
    durationMs: 10 * MIN,
    events: [
      { type: 'user_msg',      summary: 'check zshrc aliases',                  offsetMs: 0 },
      { type: 'tool_use',      tool: 'Read',    summary: '.zshrc',              offsetMs: 500, duration: 25, success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'file content',        offsetMs: 600 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'alias .zshrc',        offsetMs: 2_000, duration: 30, success: true },
      { type: 'tool_use',      tool: 'Grep',    summary: 'alias .zshrc',        offsetMs: 20_000, duration: 30, success: true },
      { type: 'tool_use',      tool: 'Grep',    summary: 'alias .zshrc',        offsetMs: 40_000, duration: 30, success: true },
      { type: 'assistant_msg', summary: 'Found 7 aliases. Adding new one.',     offsetMs: 45_000 },
      { type: 'user_msg',      summary: 'stop, I already have that alias',      offsetMs: 50_000 },
      { type: 'assistant_msg', summary: 'Got it, stopping.',                    offsetMs: 51_000 },
    ],
  },

  // 8 — playground (skill n-gram sessions 4+5 — extra repetitions to push freq ≥ 5)
  {
    project: 'playground',
    branch: 'develop',
    startOffset: 36 * HOUR,
    durationMs: 11 * MIN,
    events: [
      { type: 'user_msg',      summary: 'run tests and fix issues',             offsetMs: 0 },
      { type: 'tool_use',      tool: 'Read',    summary: 'test/setup.ts',       offsetMs: 600, duration: 28, success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'content',             offsetMs: 700 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'describe test/setup.ts', offsetMs: 1_200, duration: 40, success: true },
      { type: 'tool_result',   tool: 'Grep',    summary: '4 matches',           offsetMs: 1_300 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git status',          offsetMs: 2_000, duration: 65, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 2_100 },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit test/setup.ts fix beforeAll', offsetMs: 3_200, duration: 140, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 3_400 },
      // second occurrence of the same sequence within the same session
      { type: 'tool_use',      tool: 'Read',    summary: 'test/helpers.ts',     offsetMs: 4_500, duration: 28, success: true },
      { type: 'tool_result',   tool: 'Read',    summary: 'content',             offsetMs: 4_600 },
      { type: 'tool_use',      tool: 'Grep',    summary: 'mock test/helpers.ts', offsetMs: 5_000, duration: 40, success: true },
      { type: 'tool_result',   tool: 'Grep',    summary: '2 matches',           offsetMs: 5_100 },
      { type: 'tool_use',      tool: 'Bash',    summary: 'git status',          offsetMs: 5_800, duration: 60, success: true },
      { type: 'tool_result',   tool: 'Bash',    summary: 'Exit 0',              offsetMs: 5_900 },
      { type: 'tool_use',      tool: 'Edit',    summary: 'Edit test/helpers.ts add mock fn', offsetMs: 6_800, duration: 130, success: true },
      { type: 'tool_result',   tool: 'Edit',    summary: 'Written',             offsetMs: 7_000 },
    ],
  },
];

// ─── wipe ─────────────────────────────────────────────────────────────────────

async function wipe() {
  const res = await fetch(`${API}/admin/wipe`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wipe failed ${res.status}: ${text}`);
  }
  const json = await res.json();
  console.log('[seed] wiped:', json.message);
}

// ─── ingest ───────────────────────────────────────────────────────────────────

async function ingestSession(blueprint, idx) {
  const sessionId = uuid();
  const startedAt = ago(blueprint.startOffset);
  const endedAt = startedAt + blueprint.durationMs;

  // Build event list with absolute timestamps
  const events = blueprint.events.map((ev) => ({
    ts: startedAt + ev.offsetMs,
    type: ev.type,
    tool_name: ev.tool ?? null,
    summary: ev.summary ?? null,
    duration_ms: ev.duration ?? null,
    success: ev.success !== undefined ? (ev.success ? 1 : 0) : null,
    jsonl_offset: null,
  }));

  const toolCalls = events.filter((e) => e.type === 'tool_use').length;

  const payload = {
    source: 'seed-demo',
    session: {
      id: sessionId,
      user: 'demo-user',
      project: blueprint.project,
      branch: blueprint.branch,
      cwd: `/${blueprint.project}`,
      started_at: startedAt,
      ended_at: endedAt,
      total_cost_usd: 0,
      total_input_tokens: Math.floor(Math.random() * 8000) + 2000,
      total_output_tokens: Math.floor(Math.random() * 3000) + 500,
      total_tool_calls: toolCalls,
      status: 'completed',
    },
    events,
  };

  const res = await fetch(`${API}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ingest ${idx + 1} failed ${res.status}: ${text}`);
  }

  const result = await res.json();
  return {
    sessionId,
    project: blueprint.project,
    eventsInserted: result.events_inserted,
    mistakesDetected: result.mistakes_detected,
    skillCandidatesTouched: result.skill_candidates_touched,
  };
}

// ─── summary ─────────────────────────────────────────────────────────────────

async function getSummary() {
  const [sessRes, mistRes, skillRes] = await Promise.all([
    fetch(`${API}/sessions?limit=200`),
    fetch(`${API}/mistakes?limit=500`),
    fetch(`${API}/skills?promoted=null&limit=500`),
  ]);
  const sess = sessRes.ok ? await sessRes.json() : { count: '?' };
  const mist = mistRes.ok ? await mistRes.json() : { count: '?' };
  const skill = skillRes.ok ? await skillRes.json() : { count: '?' };
  return { sessions: sess.count, mistakes: mist.count, skills: skill.count };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed] target API: ${API}`);

  // Health check
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error('[seed] ERROR: API is offline. Start it with: npm run dev:api');
    process.exit(1);
  }

  // Wipe
  await wipe();

  // Ingest sessions
  let totalMistakes = 0;
  let totalSkills = 0;
  for (let i = 0; i < SESSIONS.length; i++) {
    const result = await ingestSession(SESSIONS[i], i);
    console.log(
      `[seed] session ${i + 1}/${SESSIONS.length}: ${result.project} ` +
      `(${result.eventsInserted} events, ${result.mistakesDetected} mistakes, ` +
      `${result.skillCandidatesTouched} skill touches)`
    );
    totalMistakes += result.mistakesDetected;
    totalSkills += result.skillCandidatesTouched;
  }

  // Final summary
  const summary = await getSummary();
  console.log('\n[seed] Done.');
  console.log(`       Sessions:  ${summary.sessions}`);
  console.log(`       Mistakes:  ${summary.mistakes}`);
  console.log(`       Skills:    ${summary.skills} candidates`);
}

main().catch((err) => {
  console.error('[seed] Fatal:', err.message);
  process.exit(1);
});
