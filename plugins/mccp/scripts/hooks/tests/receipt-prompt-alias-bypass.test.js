'use strict';

// v1.1.0-s1 — receipt-prompt alias bypass symmetry.
//
// Background: /mccp:review-pr is documented as an alias of /mccp:code-review
// (PR Review Mode). The bypass guard at receipt-prompt.js used to match the
// canonical command name only, so --standalone and Local Review Mode bypasses
// were silently ignored on the alias path. The user-visible symptom was a
// phantom mccp-pr-codex MISSING block on the branch-fallback decision slug.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('../../receipt/tests/helpers');

const HOOK = path.resolve(__dirname, '..', 'receipt-prompt.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

function runHook(event) {
  const env = Object.assign({}, process.env, {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  });
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: env,
  });
}

function parseStdout(stdout) {
  if (!stdout || !stdout.trim()) return null;
  try { return JSON.parse(stdout); } catch (_) { return null; }
}

function assertNotBlocked(r, label) {
  assert.strictEqual(r.status, 0, label + ' must exit 0; got ' + r.status +
    '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
  const payload = parseStdout(r.stdout);
  if (payload) {
    assert.notStrictEqual(payload.decision, 'block',
      label + ' must not emit decision="block": ' + r.stdout);
  }
}

test('receipt-prompt: /mccp:review-pr --standalone honored via alias bypass', function () {
  const repo = mkTmpRepo();
  const r = runHook({
    session_id: 'test',
    tool_use_id: 'tuid-alias-standalone',
    cwd: repo,
    command_name: 'mccp:review-pr',
    command_args: '27 --standalone',
  });
  assertNotBlocked(r, 'review-pr --standalone');
});

test('receipt-prompt: /mccp:review-pr no-arg honored as Local Review Mode', function () {
  const repo = mkTmpRepo();
  const r = runHook({
    session_id: 'test',
    tool_use_id: 'tuid-alias-local',
    cwd: repo,
    command_name: 'mccp:review-pr',
    command_args: '',
  });
  assertNotBlocked(r, 'review-pr no-arg');
});

test('receipt-prompt: /mccp:code-review --standalone still honored (regression guard)', function () {
  const repo = mkTmpRepo();
  const r = runHook({
    session_id: 'test',
    tool_use_id: 'tuid-canonical-standalone',
    cwd: repo,
    command_name: 'mccp:code-review',
    command_args: '27 --standalone',
  });
  assertNotBlocked(r, 'code-review --standalone');
});
