/**
 * src/installer.js
 *
 * Idempotent hook installer for ~/.claude/settings.json.
 *
 * - Reads existing settings.json (or {} if missing).
 * - Backs up to settings.json.claude-fuse.bak on first run.
 * - Deep-merges hook entries for 4 lifecycle events.
 * - Tags each claude-fuse entry with { _managed_by: 'claude-fuse' }.
 * - Atomic write: .tmp + rename.
 * - Never removes pre-existing user hooks.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MANAGED_BY = 'claude-fuse';
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];

/**
 * Return the absolute path to claude-fuse-hook.js.
 * This is the bin script next to installer (../../bin/).
 */
export function getHookScriptPath() {
  return path.resolve(__dirname, '..', 'bin', 'claude-fuse-hook.js');
}

/**
 * Build the hook entry for a given event name.
 */
export function buildHookEntry(eventName, hookScriptPath) {
  return {
    _managed_by: MANAGED_BY,
    command: `node ${hookScriptPath} ${eventName}`,
  };
}

/**
 * Read settings.json from settingsPath. Returns {} if missing or unreadable.
 */
export function readSettings(settingsPath) {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Check whether the claude-fuse hook entry already exists in the hooks array for the event.
 */
function hasHookEntry(hooks, eventName, hookScriptPath) {
  const entries = hooks[eventName];
  if (!Array.isArray(entries)) return false;
  return entries.some(
    e => e._managed_by === MANAGED_BY && e.command === buildHookEntry(eventName, hookScriptPath).command
  );
}

/**
 * Merge claude-fuse hook entries into settings object.
 * Returns { settings (mutated), changed: boolean }.
 */
export function mergeHooks(settings, hookScriptPath) {
  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }

  let changed = false;

  for (const eventName of HOOK_EVENTS) {
    if (!Array.isArray(settings.hooks[eventName])) {
      settings.hooks[eventName] = [];
    }

    if (!hasHookEntry(settings.hooks, eventName, hookScriptPath)) {
      settings.hooks[eventName].push(buildHookEntry(eventName, hookScriptPath));
      changed = true;
    }
  }

  return { settings, changed };
}

/**
 * Remove all claude-fuse managed hook entries from settings object.
 * Returns { settings (mutated), changed: boolean }.
 */
export function removeHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object') {
    return { settings, changed: false };
  }

  let changed = false;

  for (const eventName of Object.keys(settings.hooks)) {
    const before = settings.hooks[eventName];
    if (!Array.isArray(before)) continue;
    const after = before.filter(e => e._managed_by !== MANAGED_BY);
    if (after.length !== before.length) {
      settings.hooks[eventName] = after;
      changed = true;
    }
    // Clean up empty arrays
    if (settings.hooks[eventName].length === 0) {
      delete settings.hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return { settings, changed };
}

/**
 * Atomic write: write to .tmp then rename.
 */
export function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Install claude-fuse hooks into settingsPath.
 * Returns { installed: boolean, alreadyPresent: boolean, backupPath: string | null }
 */
export function install(settingsPath, hookScriptPath) {
  hookScriptPath = hookScriptPath || getHookScriptPath();

  const settings = readSettings(settingsPath);
  const { settings: merged, changed } = mergeHooks(settings, hookScriptPath);

  if (!changed) {
    return { installed: false, alreadyPresent: true, backupPath: null };
  }

  // Create backup if it doesn't already exist
  const backupPath = settingsPath + '.claude-fuse.bak';
  let backupCreated = null;
  if (!fs.existsSync(backupPath)) {
    try {
      const original = fs.existsSync(settingsPath)
        ? fs.readFileSync(settingsPath, 'utf8')
        : '{}';
      fs.writeFileSync(backupPath, original, 'utf8');
      backupCreated = backupPath;
    } catch (err) {
      process.stderr.write(`[installer] warning: could not create backup: ${err.message}\n`);
    }
  }

  atomicWrite(settingsPath, JSON.stringify(merged, null, 2));

  return { installed: true, alreadyPresent: false, backupPath: backupCreated };
}

/**
 * Uninstall claude-fuse hooks from settingsPath.
 * Returns { removed: boolean, restoredFromBackup: boolean }
 */
export function uninstall(settingsPath) {
  const backupPath = settingsPath + '.claude-fuse.bak';

  // Prefer restoring from backup if it exists
  if (fs.existsSync(backupPath)) {
    try {
      const backup = fs.readFileSync(backupPath, 'utf8');
      atomicWrite(settingsPath, backup);
      return { removed: true, restoredFromBackup: true };
    } catch (err) {
      process.stderr.write(`[installer] could not restore from backup: ${err.message}\n`);
    }
  }

  // Fall back to surgical removal
  const settings = readSettings(settingsPath);
  const { settings: cleaned, changed } = removeHooks(settings);

  if (!changed) {
    return { removed: false, restoredFromBackup: false };
  }

  atomicWrite(settingsPath, JSON.stringify(cleaned, null, 2));
  return { removed: true, restoredFromBackup: false };
}

/**
 * Return the default settings path.
 */
export function getSettingsPath() {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.claude', 'settings.json');
}
