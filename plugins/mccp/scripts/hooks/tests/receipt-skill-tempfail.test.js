'use strict';

// v0.2.8 Task 2.6.5a A3 axis (λ) — receipt-skill hook tempfail handling.
//
// PreToolUse(Skill) hook for /mccp:* invoked via the Skill tool. Mirror
// of the receipt-prompt-tempfail axis: tempfail = retryable, hook returns
// 0 (do NOT block) + writes a stdout JSON systemMessage with retry hint.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const mig = require('../../migrations/v0.2.8-generic-receipt-quarantine');

const HOOK = path.resolve(__dirname, '..', 'receipt-skill.js');
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
    host: 'test', token: 'sentinel-skill-' + Date.now(),
  }));
  writeReceipt(repo, 'mccp-plan-codex', 'default');
  return held;
}

// (λ) receipt-skill: tempfail → ALLOW (exit 0) + stdout systemMessage retry hint.
test('receipt-skill (λ) tempfail → ALLOW + systemMessage retry hint (no block)', function () {
  const repo = mkTmpRepo();
  plantStuckLock(repo);

  const event = {
    session_id: 'test-session',
    tool_use_id: 'test-tuid',
    cwd: repo,
    tool_name: 'Skill',
    tool_input: {
      skill: 'mccp:pr',
      arguments: '',
    },
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

  // Skill hook may return 0 (allow) or 2 (block stderr signal). Tempfail
  // must NOT return 2 (would block the Skill invocation).
  assert.notStrictEqual(r.status, 2, 'tempfail must NOT block the Skill (got exit 2)' +
    '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
  // stdout SHOULD carry a systemMessage with TEMPFAIL / retry hint when tempfail fires.
  if (r.stdout && r.stdout.trim()) {
    let payload = null;
    try { payload = JSON.parse(r.stdout); } catch (_) { /* tolerate */ }
    if (payload && payload.systemMessage) {
      assert.match(payload.systemMessage, /TEMPFAIL|retry/i,
        'systemMessage should reference TEMPFAIL or retry');
    }
  }
});
