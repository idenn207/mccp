'use strict';

// v0.2.8 Task 2.6.5b R6-F2 — host-aware lock reclaim regression tests.
//
// Threat model (PR-Codex R6 Finding 2): tryReclaimStaleLock used to reclaim
// on `pidDead OR mtimeStale`, ignoring the `host` field recorded in the
// lock body. Two real failure modes:
//
//   (a) Same-host live holder in a sync section longer than LEASE_TTL_MS
//       (slow scanActiveGeneric, slow FS) → mtime stale → reclaimed
//       while still mutating → concurrent renames → corrupt marker.
//
//   (b) Cross-host live holder: process.kill(pid, 0) against a foreign
//       PID namespace is meaningless and may collide with an unrelated
//       local PID; treating mtime as the only signal is the correct
//       conservative choice for cross-host.
//
// New contract:
//   same-host + PID alive   → NEVER reclaim (regardless of mtime)
//   same-host + PID dead    → reclaim
//   cross-host + mtime stale → reclaim (PID introspection not authoritative)
//   cross-host + mtime fresh → no reclaim
//
// Plus verifyOwnership() lets the holder abort mid-run if its token is no
// longer in the lock body.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const mig = require('../v0.2.8-generic-receipt-quarantine');

const LEASE_TTL_MS = mig.LEASE_TTL_MS;
const LOCK_REL = path.join('.claude', 'receipts', '.migrations', 'v0.2.8-generic-quarantine.lock');

function writeLock(repo, body, mtimeOffsetMs) {
  const p = path.join(repo, LOCK_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(body), 'utf8');
  if (typeof mtimeOffsetMs === 'number') {
    const t = new Date(Date.now() + mtimeOffsetMs);
    fs.utimesSync(p, t, t);
  }
  return p;
}

// (a) Same-host live PID + mtime stale → NEVER reclaim.
test('tryReclaimStaleLock (a) same-host live PID + stale mtime → no reclaim', function () {
  const repo = mkTmpRepo();
  const p = writeLock(repo, {
    pid: process.pid,            // alive (us)
    started_at: new Date().toISOString(),
    host: os.hostname(),         // same host
    token: 'tkn-live',
  }, -(LEASE_TTL_MS + 5_000));   // mtime well past lease window

  const reclaimed = mig.tryReclaimStaleLock(p);
  assert.strictEqual(reclaimed, false,
    'must not reclaim live same-host holder even when mtime is stale');
  assert.ok(fs.existsSync(p), 'lock file must still exist');
});

// (b) Same-host dead PID + mtime fresh → reclaim (PID liveness is
// authoritative on same host).
test('tryReclaimStaleLock (b) same-host dead PID + fresh mtime → reclaim', function () {
  const repo = mkTmpRepo();
  const p = writeLock(repo, {
    pid: 999999,                 // very likely not in use
    started_at: new Date().toISOString(),
    host: os.hostname(),         // same host
    token: 'tkn-dead',
  }, 0);                          // mtime: now (fresh)

  // Skip if 999999 happens to be alive on this machine (rare but possible).
  let isAlive = true;
  try { process.kill(999999, 0); } catch (e) { isAlive = (e.code === 'EPERM'); }
  if (isAlive) {
    // Cannot reliably test dead PID — accept either outcome.
    return;
  }

  const reclaimed = mig.tryReclaimStaleLock(p);
  assert.strictEqual(reclaimed, true,
    'must reclaim same-host orphan (PID dead)');
  assert.strictEqual(fs.existsSync(p), false, 'lock file must be unlinked');
});

// (c) Cross-host + mtime stale → reclaim (mtime-only on cross-host).
test('tryReclaimStaleLock (c) cross-host + stale mtime → reclaim', function () {
  const repo = mkTmpRepo();
  const p = writeLock(repo, {
    pid: process.pid,            // alive locally, but...
    started_at: new Date().toISOString(),
    host: 'some-other-host.example',  // different host name
    token: 'tkn-cross',
  }, -(LEASE_TTL_MS + 5_000));

  const reclaimed = mig.tryReclaimStaleLock(p);
  assert.strictEqual(reclaimed, true,
    'cross-host stale-mtime lock must be reclaimed (PID introspection not authoritative)');
});

// (d) Cross-host + mtime fresh → no reclaim.
test('tryReclaimStaleLock (d) cross-host + fresh mtime → no reclaim', function () {
  const repo = mkTmpRepo();
  const p = writeLock(repo, {
    pid: process.pid,
    started_at: new Date().toISOString(),
    host: 'some-other-host.example',
    token: 'tkn-cross-fresh',
  }, 0);

  const reclaimed = mig.tryReclaimStaleLock(p);
  assert.strictEqual(reclaimed, false,
    'cross-host fresh-mtime lock must not be reclaimed');
});

// (e) verifyOwnership returns true when the lock body's token matches.
test('verifyOwnership (e) matching token → true', function () {
  const repo = mkTmpRepo();
  writeLock(repo, {
    pid: process.pid,
    started_at: new Date().toISOString(),
    host: os.hostname(),
    token: 'my-token-7777',
  }, 0);

  assert.strictEqual(mig.verifyOwnership(repo, 'my-token-7777'), true);
});

// (f) verifyOwnership returns false when token differs (lock was reclaimed
// and re-acquired by another holder before this caller noticed).
test('verifyOwnership (f) mismatched token → false', function () {
  const repo = mkTmpRepo();
  writeLock(repo, {
    pid: process.pid,
    started_at: new Date().toISOString(),
    host: os.hostname(),
    token: 'someone-elses-token',
  }, 0);

  assert.strictEqual(mig.verifyOwnership(repo, 'my-token-7777'), false);
});

// (g) verifyOwnership returns false when the lock file is missing entirely
// (defensive: caller should treat as "we no longer hold").
test('verifyOwnership (g) missing lock file → false', function () {
  const repo = mkTmpRepo();
  assert.strictEqual(mig.verifyOwnership(repo, 'any-token'), false);
});
