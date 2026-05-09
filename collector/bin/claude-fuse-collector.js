#!/usr/bin/env node
/**
 * bin/claude-fuse-collector.js [install|uninstall|flush-queue]
 *
 * Management CLI for the collector.
 *   install      — merge hook entries into ~/.claude/settings.json
 *   uninstall    — remove managed hook entries (restore backup if available)
 *   flush-queue  — drain ~/.claude-fuse/queue/ to the api
 */

import { program } from 'commander';
import { install, uninstall, getSettingsPath } from '../src/installer.js';
import { flushQueue, getQueueDir } from '../src/queue.js';
import { makePostFn } from '../src/api-client.js';

program
  .name('claude-fuse-collector')
  .description('Manage claude-fuse collector installation');

program
  .command('install')
  .description('Install hook entries into ~/.claude/settings.json')
  .option('--settings <path>', 'Override settings.json path (default: ~/.claude/settings.json)')
  .action((opts) => {
    const settingsPath = opts.settings || getSettingsPath();
    console.log(`Installing hooks into: ${settingsPath}`);
    const result = install(settingsPath);
    if (result.alreadyPresent) {
      console.log('Already installed — no changes made.');
    } else {
      console.log('Hooks installed successfully.');
      if (result.backupPath) {
        console.log(`Backup created at: ${result.backupPath}`);
      }
    }
  });

program
  .command('uninstall')
  .description('Remove claude-fuse managed hook entries')
  .option('--settings <path>', 'Override settings.json path')
  .action((opts) => {
    const settingsPath = opts.settings || getSettingsPath();
    console.log(`Uninstalling hooks from: ${settingsPath}`);
    const result = uninstall(settingsPath);
    if (!result.removed) {
      console.log('No claude-fuse hooks found — nothing to remove.');
    } else if (result.restoredFromBackup) {
      console.log('Restored from backup.');
    } else {
      console.log('Hooks removed.');
    }
  });

program
  .command('flush-queue')
  .description('Drain ~/.claude-fuse/queue/ to the api')
  .action(async () => {
    const queueDir = getQueueDir();
    console.log(`Flushing queue from: ${queueDir}`);
    const postFn = makePostFn(30000);
    const result = await flushQueue(postFn, queueDir);
    console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
    if (result.errors.length > 0) {
      result.errors.forEach(e => console.error(`  [error] ${e}`));
    }
    if (result.failed > 0) process.exit(1);
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}
