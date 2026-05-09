#!/usr/bin/env node
/**
 * bin/claude-fuse-backfill.js
 *
 * CLI: node bin/claude-fuse-backfill.js --since 30d [--dry-run]
 *
 * Scans ~/.claude/projects/-Users-sam-*  JSONL files,
 * parses them, batches events, and POSTs to :5457/ingest.
 */

import { program } from 'commander';
import path from 'path';
import os from 'os';
import { parseSince, parseFile, scanAllProjects } from '../src/jsonl-parser.js';
import { batchAndSend } from '../src/batcher.js';
import { makePostFn } from '../src/api-client.js';

program
  .name('claude-fuse-backfill')
  .description('Backfill Claude Code session history into claude-fuse api')
  .option('--since <period>', 'How far back to scan. E.g. 30d, 7d, 24h, or ISO date.', '30d')
  .option('--dry-run', 'Print plan without POSTing', false)
  .option('--projects-dir <dir>', 'Override ~/.claude/projects directory')
  .parse(process.argv);

const opts = program.opts();

async function main() {
  let sinceMs;
  try {
    sinceMs = parseSince(opts.since);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const home = process.env.HOME || os.homedir();
  const projectsDir = opts.projectsDir || path.join(home, '.claude', 'projects');

  const postFn = makePostFn(30000); // 30s timeout for backfill

  let totalFiles = 0;
  let totalEvents = 0;
  let totalErrors = 0;

  console.log(`Backfill since: ${new Date(sinceMs).toISOString()}`);
  console.log(`Projects dir: ${projectsDir}`);
  if (opts.dryRun) console.log('DRY RUN — no data will be sent\n');

  for await (const { filePath, projectDir } of scanAllProjects(projectsDir, sinceMs)) {
    totalFiles++;
    try {
      const { session, events, rawLines } = await parseFile(filePath, projectDir);

      if (opts.dryRun) {
        console.log(`[dry-run] ${path.basename(filePath)} — session ${session.id}, ${events.length} events, project=${session.project}`);
        totalEvents += events.length;
        continue;
      }

      const summary = await batchAndSend(session, events, 'backfill', postFn, rawLines);
      totalEvents += summary.eventsTotal;

      if (summary.errors.length > 0) {
        totalErrors += summary.errors.length;
        for (const err of summary.errors) {
          console.error(`  [error] batch ${err.batch}: ${err.error} (${err.eventCount} events, ${err.attempts} attempts)`);
        }
      } else {
        console.log(`  [ok] ${path.basename(filePath)} — ${summary.eventsTotal} events in ${summary.batches} batch(es)`);
      }
    } catch (err) {
      totalErrors++;
      console.error(`  [parse-error] ${path.basename(filePath)}: ${err.message}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Files processed: ${totalFiles}`);
  console.log(`Events total:    ${totalEvents}`);
  console.log(`Errors:          ${totalErrors}`);

  if (totalErrors > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
