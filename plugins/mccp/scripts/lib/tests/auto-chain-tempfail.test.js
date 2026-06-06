'use strict';

// v0.2.8 Task 2.6.5a A3 axis (μ) — auto-chain tempfail handling.
//
// R2 F2 + R3 absorption: orchestration scripts checking exit status must
// distinguish tempfail (transient, retry shortly) from abort (deliberate
// stop). auto-chain emits:
//   - tempfail trigger in reasons[]: { trigger: "receipt-tempfail", retryable: true }
//   - top-level reason: "receipt-tempfail" + retryable: true in stdout JSON
//   - exit code 75 (NOT 13 = ABORT_EXIT, NOT 0 = success)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const mig = require('../../migrations/v0.2.8-generic-receipt-quarantine');

const AUTO_CHAIN = path.resolve(__dirname, '..', 'auto-chain.js');
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
    host: 'test', token: 'sentinel-chain-' + Date.now(),
  }));
  writeReceipt(repo, 'mccp-plan-codex', 'default');
  return held;
}

// (μ) auto-chain check → exit 75 + reason: "receipt-tempfail" + retryable: true.
test('auto-chain (μ) tempfail → abort chain + machine-readable retry signal + exit 75', function () {
  const repo = mkTmpRepo();
  plantStuckLock(repo);

  const env = Object.assign({}, process.env, {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    // Skip cost telemetry — irrelevant to the tempfail path AND it
    // would short-circuit shouldAbort BEFORE the receipt-tempfail check.
  });
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;

  const r = spawnSync(process.execPath, [
    AUTO_CHAIN, 'check',
    '--next-step', 'pr',
    '--validate-command', 'mccp:pr',
    '--decision', 'default',
    '--skip-cost',
  ], { encoding: 'utf8', env: env, cwd: repo });

  try { fs.unlinkSync(mig.lockPath(repo)); } catch { /* ignore */ }

  assert.strictEqual(r.status, 75,
    'tempfail must exit 75 (sysexits temp failure); got ' + r.status +
    '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);

  const payload = JSON.parse(r.stdout);
  assert.strictEqual(payload.should_abort, true, 'chain must abort');
  assert.strictEqual(payload.reason, 'receipt-tempfail', 'top-level reason must be receipt-tempfail');
  assert.strictEqual(payload.retryable, true, 'top-level retryable must be true');
  const tempfailReason = (payload.reasons || []).find(x => x.trigger === 'receipt-tempfail');
  assert.ok(tempfailReason, 'reasons[] must include receipt-tempfail trigger; got: ' +
    JSON.stringify(payload.reasons));
  assert.strictEqual(tempfailReason.retryable, true, 'reason entry must carry retryable=true');
});
