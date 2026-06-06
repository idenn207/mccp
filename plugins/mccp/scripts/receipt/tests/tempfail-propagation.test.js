'use strict';

// v0.2.8 Task 2.6.5a A3 — tempfail exit propagation (axes δ, ε, ζ).
//
// Threat model (PR-Codex R6 Finding 3): before this fix, validateCommand
// encoded a migration-in-progress timeout as `{ ok:false, blocking:[{... tempfail_exit:75 }] }`,
// and the CLI/preflight collapsed any `ok=false` to exit 2. Automation
// could not distinguish a transient lock wait from a genuine gate failure,
// so retry logic was unreliable.
//
// 3 axes:
//   (δ) cli.js validate: tempfail trigger → exit 75 + result.tempfail=true
//        + EXACTLY ONE blocking[] entry with kind="tempfail"
//   (ε) preflight: same scenario → exit 75 + stderr matches /TEMPFAIL/ (not /INVALID/)
//   (ζ) non-tempfail blocking: still exits 2, no kind, no tempfail

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { mkTmpRepo } = require('./helpers');
const mig = require('../../migrations/v0.2.8-generic-receipt-quarantine');

const CLI = path.resolve(__dirname, '..', 'cli.js');

function writeReceipt(repo, gateId, decisionId, body) {
  const dir = path.join(repo, '.claude', 'receipts', gateId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, decisionId + '.json');
  fs.writeFileSync(p, JSON.stringify(body || { schema_version: 'v1', decision_id: decisionId }, null, 2));
  return p;
}

function plantStuckLock(repo) {
  // Force the migration to enter the lock-loser path: acquire the lock,
  // do not write a complete marker. validate-cmd will boot the migration,
  // see lock contention, poll for 2s, time out → in-progress-aborted.
  const held = mig.acquireLock(repo);
  if (!held) throw new Error('test setup: could not acquire lock');
  // Refresh the body so PID is the test runner's (alive) and mtime is
  // fresh — prevents tryReclaimStaleLock from succeeding.
  fs.writeFileSync(mig.lockPath(repo), JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    host: 'test',
    token: 'sentinel-stuck-' + Date.now(),
  }));
  // Plant a generic receipt so scanActiveGeneric finds work to do — keeps
  // the migration from short-circuiting.
  writeReceipt(repo, 'mccp-plan-codex', 'default');
  return held;
}

function cleanupStuckLock(repo) {
  try { fs.unlinkSync(mig.lockPath(repo)); } catch { /* ignore */ }
}

// (δ) cli.js validate: tempfail → exit 75 + result.tempfail=true + ONE blocking with kind="tempfail".
test('tempfail (δ) cli.js validate on migration-in-progress → exit 75 + canonical shape', function () {
  const repo = mkTmpRepo();
  plantStuckLock(repo);

  // Strip env vars that could short-circuit the gate (MCCP_SKIP_RECEIPT,
  // legacy bypass envs). Use env that disables receipt-mode "off".
  const env = Object.assign({}, process.env);
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;

  const r = spawnSync(process.execPath, [
    CLI, 'validate', '--command', 'mccp:pr', '--cwd', repo,
  ], { encoding: 'utf8', env: env });

  cleanupStuckLock(repo);

  assert.strictEqual(r.status, 75, 'expected exit 75, got ' + r.status + '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
  const result = JSON.parse(r.stdout);
  assert.strictEqual(result.tempfail, true, 'result.tempfail must be true');
  assert.strictEqual(result.exitCode, 75, 'result.exitCode must be 75');
  const tempfailBlocking = (result.blocking || []).filter(b => b.kind === 'tempfail');
  assert.strictEqual(tempfailBlocking.length, 1,
    'expected EXACTLY ONE blocking entry with kind="tempfail"; got: ' + JSON.stringify(result.blocking));
});

// (ε) preflight: same scenario → exit 75 + stderr says TEMPFAIL not INVALID.
test('tempfail (ε) preflight on migration-in-progress → exit 75 + stderr TEMPFAIL label', function () {
  const repo = mkTmpRepo();
  plantStuckLock(repo);

  const env = Object.assign({}, process.env);
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;

  const r = spawnSync(process.execPath, [
    CLI, 'preflight', '--command', 'mccp:pr', '--cwd', repo,
  ], { encoding: 'utf8', env: env });

  cleanupStuckLock(repo);

  assert.strictEqual(r.status, 75, 'expected exit 75; stderr: ' + r.stderr);
  assert.match(r.stderr, /TEMPFAIL/, 'stderr must surface TEMPFAIL label');
  assert.doesNotMatch(r.stderr, /\bINVALID\b/,
    'stderr must NOT use INVALID label for tempfail (different exit code)');
});

// (ζ) non-tempfail blocking: missing receipt for a downstream gate still
// exits 2, no `kind` field, no `tempfail` field — regression guard so
// we didn't accidentally relabel all blocks as tempfail.
test('tempfail (ζ) non-tempfail blocking still exits 2 (no kind, no tempfail field)', function () {
  const repo = mkTmpRepo();
  // /mccp:pr requires receipts that don't exist → genuine block, not tempfail.
  // (No stuck lock — migration boots cleanly + marker complete.)

  const env = Object.assign({}, process.env);
  delete env.MCCP_SKIP_RECEIPT;
  delete env.MCCP_RECEIPT_GATE_MODE;

  const r = spawnSync(process.execPath, [
    CLI, 'validate', '--command', 'mccp:pr', '--cwd', repo,
  ], { encoding: 'utf8', env: env });

  assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status + '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
  const result = JSON.parse(r.stdout);
  assert.notStrictEqual(result.tempfail, true, 'result.tempfail must NOT be true');
  assert.notStrictEqual(result.exitCode, 75);
  const tempfailBlocking = (result.blocking || []).filter(b => b.kind === 'tempfail');
  assert.strictEqual(tempfailBlocking.length, 0,
    'no blocking entry should carry kind="tempfail" in a real block');
});
