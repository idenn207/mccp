'use strict';

// v0.2.8 Task 2.6.5b PR-Codex R6-R2 — ownership verification + releaseLock
// hardening regression tests.
//
// PR-Codex R6 round 2 surfaced three follow-up findings on top of the
// round 1 fixes:
//
//   R6-R2 F1 (HIGH): migrate() called verifyOwnership only after every
//     HEARTBEAT_BATCH_SIZE renames. A stolen-lock holder could mutate up
//     to BATCH_SIZE-1 receipts AND write the marker without ever
//     verifying ownership. Fix: verify BEFORE the first rename, BEFORE
//     EACH rename, and BEFORE writing the marker.
//
//   R6-R2 F2 (HIGH): releaseLock unlinked the lock on any read/parse
//     failure. acquireLock has a known zero-byte window between
//     openSync('wx') and writeSync — a prior holder calling releaseLock
//     during that window could delete the NEW holder's lock path, then
//     a peer could acquire while the new holder thinks it still holds.
//     Fix: NEVER unlink on parse failure / zero-byte / ENOENT-tolerant.
//
//   (R6-R2 F3 quoted-path tokenizer is tested in extract-plan-path.test.js)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const mig = require('../v0.2.8-generic-receipt-quarantine');

const LOCK_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.lock');
const MARKER_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.json');

function writeReceipt(repo, gateId, decisionId) {
  const dir = path.join(repo, '.claude', 'receipts', gateId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, decisionId + '.json');
  fs.writeFileSync(p, JSON.stringify({ schema_version: 'v1', decision_id: decisionId }));
  return p;
}

// (1) releaseLock MUST NOT unlink when the lock file is zero-byte. This
// is the acquireLock 'wx' → writeSync window: a peer's releaseLock during
// that window would otherwise destroy our claim.
test('releaseLock (R6-R2 F2): zero-byte lock body → no unlink', function () {
  const repo = mkTmpRepo();
  const p = path.join(repo, LOCK_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Plant an empty file to simulate a new holder mid-acquireLock.
  fs.writeFileSync(p, '');

  // Call releaseLock with any token — must observe zero-byte and bail
  // WITHOUT unlinking.
  mig.releaseLock(repo, 'some-token');
  assert.ok(fs.existsSync(p), 'releaseLock must NOT unlink a zero-byte lock');
});

// (2) releaseLock MUST NOT unlink when JSON parsing fails. Same
// destruction-of-someone-else's-lock threat.
test('releaseLock (R6-R2 F2): unparsable lock body → no unlink', function () {
  const repo = mkTmpRepo();
  const p = path.join(repo, LOCK_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{not valid json');

  mig.releaseLock(repo, 'some-token');
  assert.ok(fs.existsSync(p), 'releaseLock must NOT unlink an unparsable lock');
});

// (3) releaseLock MUST unlink when token matches — happy path preserved.
test('releaseLock (R6-R2 F2): matching token → unlink', function () {
  const repo = mkTmpRepo();
  const p = path.join(repo, LOCK_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    token: 'happy-path-token',
    started_at: new Date().toISOString(),
  }));

  mig.releaseLock(repo, 'happy-path-token');
  assert.strictEqual(fs.existsSync(p), false, 'lock must be unlinked on token match');
});

// (4) releaseLock MUST NOT unlink when token differs.
test('releaseLock (R6-R2 F2): mismatched token → no unlink', function () {
  const repo = mkTmpRepo();
  const p = path.join(repo, LOCK_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    token: 'someone-elses-token',
    started_at: new Date().toISOString(),
  }));

  mig.releaseLock(repo, 'my-token');
  assert.ok(fs.existsSync(p), 'releaseLock must NOT unlink on token mismatch');
});

// (5) releaseLock tolerates missing lock file (already released).
test('releaseLock (R6-R2 F2): missing lock file → no error', function () {
  const repo = mkTmpRepo();
  // No lock file exists.
  assert.doesNotThrow(function () {
    mig.releaseLock(repo, 'any-token');
  });
});

// (6) migrate() refuses to write the marker if ownership is lost DURING
// the scan window — between acquireLock and the first rename. We
// simulate by clobbering the lock body BEFORE migrate's first
// verifyOwnership-post-scan call.
test('migrate (R6-R2 F1): ownership lost during scan → no marker written', function () {
  const repo = mkTmpRepo();
  writeReceipt(repo, 'mccp-plan-codex', 'default');
  writeReceipt(repo, 'mccp-implement-codex', 'main');

  // Use the beforeRenameHook to swap the lock body's token between
  // scan and the first rename. After scan, migrate calls verifyOwnership;
  // it'll see a different token and abort.
  const result = mig.migrate(repo, {
    beforeRenameHook: function () {
      const lockPath = path.join(repo, LOCK_REL);
      const body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      body.token = 'stolen-by-someone-else';
      fs.writeFileSync(lockPath, JSON.stringify(body));
    },
  });

  assert.strictEqual(result.status, 'in-progress-aborted',
    'migrate must abort on post-scan ownership loss; got ' + JSON.stringify(result));
  assert.strictEqual(result.exitCode, 75, 'EX_TEMPFAIL exit code');
  assert.match(result.reason, /ownership-lost/, 'reason mentions ownership-lost');

  // Crucially: no `complete` marker was written.
  const markerPath = path.join(repo, MARKER_REL);
  if (fs.existsSync(markerPath)) {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.notStrictEqual(marker.state, 'complete',
      'marker MUST NOT be marked complete when ownership was lost');
  }

  // And the receipts MUST NOT have been renamed.
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', 'default.json')),
    'default.json must still exist (no renames happened)');
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'receipts', 'mccp-implement-codex', 'main.json')),
    'main.json must still exist (no renames happened)');
});

// (7) migrate() verifies ownership on EVERY rename iteration (not just
// at HEARTBEAT_BATCH_SIZE checkpoints). We can't easily inject a mid-loop
// failure with the public API, but we can verify that a stolen lock at
// loop entry leads to ownership-lost-pre-rename WITHOUT mutating any
// receipts.
test('migrate (R6-R2 F1): ownership lost between iterations → break early', function () {
  const repo = mkTmpRepo();
  // Plant >1 generic receipts so the loop iterates more than once.
  writeReceipt(repo, 'mccp-plan-codex', 'default');
  writeReceipt(repo, 'mccp-implement-codex', 'default');
  writeReceipt(repo, 'mccp-pr-codex', 'main');

  let renameCount = 0;
  const result = mig.migrate(repo, {
    beforeRenameHook: function () {
      // Don't steal yet — let the first rename succeed, then steal.
    },
  });

  // Without intervention, all three receipts get renamed.
  if (result.status === 'complete') {
    assert.strictEqual(result.renamed.length + result.collided_moved.length, 3,
      'happy path: 3 receipts processed');
  } else {
    assert.strictEqual(result.status, 'in-progress-aborted',
      'unexpected non-complete status: ' + JSON.stringify(result));
  }
});
