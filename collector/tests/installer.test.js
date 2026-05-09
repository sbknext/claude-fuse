/**
 * tests/installer.test.js
 *
 * Unit tests for src/installer.js.
 * Uses a tmp directory — never touches the real ~/.claude/settings.json.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readSettings,
  mergeHooks,
  removeHooks,
  install,
  uninstall,
  buildHookEntry,
  HOOK_EVENTS,
} from '../src/installer.js';

const HOOK_EVENTS_LIST = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
const FAKE_HOOK_SCRIPT = '/fake/path/to/claude-fuse-hook.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tmpDir;
let settingsPath;

function makeTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-installer-test-'));
  settingsPath = path.join(tmpDir, 'settings.json');
}

function cleanTmpDir() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// readSettings
// ---------------------------------------------------------------------------
describe('readSettings', () => {
  beforeEach(makeTmpDir);
  afterEach(cleanTmpDir);

  it('returns {} when file missing', () => {
    expect(readSettings(settingsPath)).toEqual({});
  });

  it('returns parsed JSON when file exists', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ foo: 'bar' }));
    expect(readSettings(settingsPath)).toEqual({ foo: 'bar' });
  });

  it('returns {} on invalid JSON', () => {
    fs.writeFileSync(settingsPath, '{bad json');
    expect(readSettings(settingsPath)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// mergeHooks
// ---------------------------------------------------------------------------
describe('mergeHooks', () => {
  it('creates hooks section when absent', () => {
    const s = {};
    const { settings, changed } = mergeHooks(s, FAKE_HOOK_SCRIPT);
    expect(changed).toBe(true);
    expect(settings.hooks).toBeDefined();
    for (const evt of HOOK_EVENTS_LIST) {
      expect(Array.isArray(settings.hooks[evt])).toBe(true);
      expect(settings.hooks[evt].length).toBeGreaterThan(0);
    }
  });

  it('marks entries with _managed_by: claude-fuse', () => {
    const s = {};
    const { settings } = mergeHooks(s, FAKE_HOOK_SCRIPT);
    for (const evt of HOOK_EVENTS_LIST) {
      const entry = settings.hooks[evt].find(e => e._managed_by === 'claude-fuse');
      expect(entry).toBeDefined();
    }
  });

  it('is idempotent — second merge produces no diff', () => {
    const s = {};
    const { settings } = mergeHooks(s, FAKE_HOOK_SCRIPT);
    const json1 = JSON.stringify(settings);
    const { changed } = mergeHooks(settings, FAKE_HOOK_SCRIPT);
    expect(changed).toBe(false);
    expect(JSON.stringify(settings)).toBe(json1);
  });

  it('preserves existing user hooks', () => {
    const s = {
      hooks: {
        PreToolUse: [
          { command: 'node /my/custom/hook.js PreToolUse' },
        ],
      },
    };
    const { settings } = mergeHooks(s, FAKE_HOOK_SCRIPT);
    // Both user hook and claude-fuse hook present
    expect(settings.hooks.PreToolUse.length).toBe(2);
    const userHook = settings.hooks.PreToolUse.find(
      e => e.command === 'node /my/custom/hook.js PreToolUse'
    );
    expect(userHook).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// removeHooks
// ---------------------------------------------------------------------------
describe('removeHooks', () => {
  it('removes only managed entries', () => {
    const s = {
      hooks: {
        PreToolUse: [
          { command: 'node /custom/hook.js' },
          { _managed_by: 'claude-fuse', command: `node ${FAKE_HOOK_SCRIPT} PreToolUse` },
        ],
      },
    };
    const { settings, changed } = removeHooks(s);
    expect(changed).toBe(true);
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PreToolUse[0].command).toBe('node /custom/hook.js');
  });

  it('returns changed=false when no managed entries exist', () => {
    const s = { hooks: { PreToolUse: [{ command: 'custom' }] } };
    const { changed } = removeHooks(s);
    expect(changed).toBe(false);
  });

  it('cleans up empty hooks object', () => {
    const s = {};
    const { settings: withHooks } = mergeHooks(s, FAKE_HOOK_SCRIPT);
    const { settings: cleaned } = removeHooks(withHooks);
    // All claude-fuse entries removed, hooks obj should be gone or empty
    if (cleaned.hooks) {
      for (const v of Object.values(cleaned.hooks)) {
        expect(v.length).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// install / uninstall — full lifecycle against tmp settings.json
// ---------------------------------------------------------------------------
describe('install + uninstall', () => {
  beforeEach(makeTmpDir);
  afterEach(cleanTmpDir);

  it('fresh install creates settings.json with hooks', () => {
    const result = install(settingsPath, FAKE_HOOK_SCRIPT);
    expect(result.installed).toBe(true);
    expect(fs.existsSync(settingsPath)).toBe(true);
    const s = readSettings(settingsPath);
    for (const evt of HOOK_EVENTS_LIST) {
      expect(Array.isArray(s.hooks?.[evt])).toBe(true);
    }
  });

  it('creates backup on first install', () => {
    install(settingsPath, FAKE_HOOK_SCRIPT);
    const backupPath = settingsPath + '.claude-fuse.bak';
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it('second install is no-op (alreadyPresent=true)', () => {
    install(settingsPath, FAKE_HOOK_SCRIPT);
    const s1 = fs.readFileSync(settingsPath, 'utf8');
    const result2 = install(settingsPath, FAKE_HOOK_SCRIPT);
    expect(result2.alreadyPresent).toBe(true);
    const s2 = fs.readFileSync(settingsPath, 'utf8');
    expect(s1).toBe(s2);
  });

  it('preserves pre-existing user hooks during install', () => {
    const existing = {
      someOtherConfig: true,
      hooks: {
        PreToolUse: [{ command: 'node /existing/hook.js' }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
    install(settingsPath, FAKE_HOOK_SCRIPT);
    const s = readSettings(settingsPath);
    // User hook preserved
    const userHook = s.hooks.PreToolUse.find(e => e.command === 'node /existing/hook.js');
    expect(userHook).toBeDefined();
    // claude-fuse hook also present
    const cfHook = s.hooks.PreToolUse.find(e => e._managed_by === 'claude-fuse');
    expect(cfHook).toBeDefined();
    // Other config preserved
    expect(s.someOtherConfig).toBe(true);
  });

  it('uninstall restores from backup', () => {
    const original = JSON.stringify({ hello: 'world' }, null, 2);
    fs.writeFileSync(settingsPath, original);
    install(settingsPath, FAKE_HOOK_SCRIPT);
    const result = uninstall(settingsPath);
    expect(result.removed).toBe(true);
    expect(result.restoredFromBackup).toBe(true);
    const after = fs.readFileSync(settingsPath, 'utf8');
    expect(after).toBe(original);
  });

  it('uninstall without backup surgically removes managed hooks', () => {
    // Install without a backup being present
    install(settingsPath, FAKE_HOOK_SCRIPT);
    const backupPath = settingsPath + '.claude-fuse.bak';
    fs.unlinkSync(backupPath); // remove backup to force surgical path
    const result = uninstall(settingsPath);
    expect(result.removed).toBe(true);
    expect(result.restoredFromBackup).toBe(false);
    const s = readSettings(settingsPath);
    // No claude-fuse entries remain
    if (s.hooks) {
      for (const entries of Object.values(s.hooks)) {
        const cfEntries = entries.filter(e => e._managed_by === 'claude-fuse');
        expect(cfEntries.length).toBe(0);
      }
    }
  });
});
