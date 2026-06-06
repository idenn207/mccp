'use strict';

// v0.2.8 Task 2.6.5b R6-F1 — readReceipt symlink-guard regression tests.
//
// Threat model (PR-Codex R6 Finding 1): listReceipts already had an
// isSafeGateDir check (lstat-based, refuses symlinked/non-directory gate
// dirs), but readReceipt read the receipt path directly. Result: a
// user-supplied or attacker-planted symlink at `.claude/receipts/<gate>/`
// pointing outside the worktree let validate-cmd consume an external
// receipt even when listReceipts had silently skipped it. Migration also
// silently marked `complete` because the silent-skip in listGenericReceipts
// made `remaining.length === 0` look like success.
//
// 3 axes:
//   (1) readReceipt(symlinked gate dir)   → throws UNSAFE_GATE_DIR
//   (2) listUnsafeGateDirs()              → returns the symlinked entry
//   (3) readReceipt(normal gate dir)      → reads receipt body unchanged

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { mkTmpRepo } = require('./helpers');
const { readReceipt, listUnsafeGateDirs, writeReceipt } = require('../store');

function tryCreateDirLink(targetDir, linkPath) {
  try {
    if (process.platform === 'win32') {
      fs.symlinkSync(targetDir, linkPath, 'junction');
    } else {
      fs.symlinkSync(targetDir, linkPath, 'dir');
    }
    return true;
  } catch (_) { return false; }
}

// (1) readReceipt MUST throw UNSAFE_GATE_DIR when the gate dir is a
// symlink, even if the receipt file behind the link is parseable.
test('readReceipt (1) symlinked gate dir → UNSAFE_GATE_DIR thrown', function (t) {
  const repo = mkTmpRepo();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ext-rr-'));
  const externalGateDir = path.join(externalRoot, 'mccp-plan-codex');
  fs.mkdirSync(externalGateDir, { recursive: true });
  fs.writeFileSync(path.join(externalGateDir, 'default.json'),
    JSON.stringify({ schema_version: 'v1', decision_id: 'default', stolen: true }));

  const linkPath = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const linked = tryCreateDirLink(externalGateDir, linkPath);
  if (!linked) {
    t.skip('symlink/junction creation requires elevated perms on this platform');
    return;
  }

  assert.throws(
    function () { readReceipt(repo, 'mccp-plan-codex', 'default'); },
    function (err) {
      return err && err.code === 'UNSAFE_GATE_DIR';
    },
    'readReceipt must throw UNSAFE_GATE_DIR when gate dir is symlinked'
  );

  try { fs.rmSync(externalRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

// (2) listUnsafeGateDirs() surfaces the symlinked entry so the migration
// can refuse to mark `complete` while it's present.
test('listUnsafeGateDirs (2) reports symlinked gate dir', function (t) {
  const repo = mkTmpRepo();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ext-ls-'));
  fs.mkdirSync(externalRoot, { recursive: true });

  const linkPath = path.join(repo, '.claude', 'receipts', 'mccp-implement-codex');
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const linked = tryCreateDirLink(externalRoot, linkPath);
  if (!linked) {
    t.skip('symlink/junction creation requires elevated perms on this platform');
    return;
  }

  // Also plant a normal gate dir to ensure listing is selective.
  fs.mkdirSync(path.join(repo, '.claude', 'receipts', 'mccp-plan-codex'), { recursive: true });

  const unsafe = listUnsafeGateDirs(repo);
  const symlinked = unsafe.filter(u => u.gate_id === 'mccp-implement-codex');
  assert.strictEqual(symlinked.length, 1,
    'symlinked gate dir must appear in listUnsafeGateDirs; got ' + JSON.stringify(unsafe));
  assert.strictEqual(symlinked[0].kind, 'symlink');

  // Normal gate dir is NOT reported as unsafe.
  const normalReported = unsafe.filter(u => u.gate_id === 'mccp-plan-codex');
  assert.strictEqual(normalReported.length, 0,
    'normal gate dir must NOT appear as unsafe; got ' + JSON.stringify(unsafe));

  try { fs.rmSync(externalRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

// (3) readReceipt(normal gate dir) still works after the guard.
// Regression-guard so the new lstat check doesn't false-positive on a
// regular directory.
test('readReceipt (3) normal gate dir reads receipt body', function () {
  const repo = mkTmpRepo();
  const receipt = {
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    decision_id: 'happy-path',
    plan_hash: 'sha256:deadbeef',
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:cafe',
    receipt_hash: 'sha256:f00d',
    meta: { created_at: '2026-06-07T00:00:00.000Z' },
  };
  writeReceipt(repo, receipt);

  const got = readReceipt(repo, 'mccp-plan-codex', 'happy-path');
  assert.ok(got, 'receipt must be returned');
  assert.strictEqual(got.decision_id, 'happy-path');
  assert.strictEqual(got.round, 1);
});

// (4) Non-existent gate dir → null (existing contract preserved). The
// guard only fires when the dir exists AND is unsafe; a missing dir is
// the empty-state case validate-cmd treats as "no receipt yet."
test('readReceipt (4) non-existent gate dir → null', function () {
  const repo = mkTmpRepo();
  const got = readReceipt(repo, 'mccp-plan-codex', 'missing');
  assert.strictEqual(got, null);
});
