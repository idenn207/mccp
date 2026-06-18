'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', 'render-trigger-session-start.js');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-hook-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}
function cleanup(root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }

// Single subprocess path: spawn the hook with empty stdin, assert exit 0,
// stderr (if any) contains the hook tag prefix on failure paths, and that
// the hook returns 0 even when run from a fresh tmpdir (defensive load).
test('render-trigger-session-start hook: exit 0 even from fresh tmpdir', () => {
  const root = tmpRepo();
  try {
    const result = spawnSync(process.execPath, [HOOK], {
      cwd: root, input: '', encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, 'hook always exits 0 (stderr: ' + (result.stderr || '') + ')');
    // STATUS.md may or may not exist depending on derive success; we only
    // assert the contract: the hook does not throw an unhandled exception
    // (i.e., status===0). The trigger.js loud fail-open contract handles
    // the rest, and is exercised by trigger.test.js.
  } finally { cleanup(root); }
});

test('render-trigger-session-start hook: missing renderer lib does not crash', () => {
  // Stage a tmpdir where CLAUDE_PLUGIN_ROOT points at a directory lacking
  // lib/renderer/. The hook's lazy-require must catch the MODULE_NOT_FOUND
  // and exit 0.
  const root = tmpRepo();
  const fakePlugin = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fake-plugin-'));
  try {
    const result = spawnSync(process.execPath, [HOOK], {
      cwd: root, input: '', encoding: 'utf8', timeout: 15000,
      env: Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: fakePlugin }),
    });
    assert.equal(result.status, 0, 'hook exits 0 even with bogus CLAUDE_PLUGIN_ROOT');
  } finally {
    cleanup(root); cleanup(fakePlugin);
  }
});
