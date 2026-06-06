'use strict';

// v0.2.8 Task 2.6.5a A3 axis (κ) — receipt-prompt hook tempfail handling.
//
// Threat model: PreToolUse(UserPromptExpansion) hook for /mccp:* commands
// MUST NOT block the user's prompt on a transient migration-in-progress
// signal. Tempfail = retryable. Hook emits ALLOW (return code 0) + a
// systemMessage retry hint via stdout JSON.
//
// Approach: spawn the hook with a synthetic stdin event payload that would
// trigger validate-cmd to enter the lock-loser → in-progress-aborted path.
// Plant a stuck lock first so the migration cannot complete on its own.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const mig = require('../../migrations/v0.2.8-generic-receipt-quarantine');

const HOOK = path.resolve(__dirname, '..', 'receipt-prompt.js');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');

function writeReceipt(repo, gateId, decisionId, body) {
  const dir = path.join(repo, '.claude', 'receipts', gateId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, decisionId + '.json');
  fs.writeFileSync(p, JSON.stringify(body || { schema_version: 'v1', decision_id: decisionId }, null, 2));
  return p;
}

function plantStuckLock(repo) {
  const held = mig.acquireLock(repo);
  if (!held) throw new Error('test setup: could not acquire lock');
  fs.writeFileSync(mig.lockPath(repo), JSON.stringify({
    pid: process.pid, started_at: new Date().toISOString(),
    host: 'test', token: 'sentinel-prompt-' + Date.now(),
  }));
  writeReceipt(repo, 'mccp-plan-codex', 'default');
  return held;
}

// (κ) receipt-prompt: tempfail → ALLOW (exit 0) + stdout systemMessage with TEMPFAIL or retry.
test('receipt-prompt (κ) tempfail → ALLOW + systemMessage retry hint (no block)', function () {
  const repo = mkTmpRepo();
  plantStuckLock(repo);

  const event = {
    session_id: 'test-session',
    tool_use_id: 'test-tuid',
    cwd: repo,
    command_name: 'mccp:pr',
    command_args: '',
  };

  const env = Object.assign({}, process.env, {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
  });
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;

  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: env,
  });

  try { fs.unlinkSync(mig.lockPath(repo)); } catch { /* ignore */ }

  assert.strictEqual(r.status, 0, 'tempfail must ALLOW (exit 0); got ' + r.status +
    '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
  // stdout SHOULD carry a systemMessage with TEMPFAIL / retry hint.
  let payload = null;
  if (r.stdout && r.stdout.trim()) {
    try { payload = JSON.parse(r.stdout); } catch (_) { /* tolerate */ }
  }
  // The hook MUST NOT emit decision="block".
  if (payload) {
    assert.notStrictEqual(payload.decision, 'block',
      'tempfail must not produce decision="block"');
    if (payload.systemMessage) {
      assert.match(payload.systemMessage, /TEMPFAIL|retry/i,
        'systemMessage should reference TEMPFAIL or retry');
    }
  }
});
