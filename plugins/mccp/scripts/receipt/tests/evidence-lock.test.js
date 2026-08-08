'use strict';

// multi-session-work-loop M3 — evidence-lock 회귀.
//
// 여기서 고정하는 것은 plan Task 2 Validate 목록이다:
//   O_EXCL 배타성 · bounded retry · lease reclaim(tri-state 미차용) ·
//   fail-closed throw · unique .tmp 이름 · rename retry · slow-live-holder 거부.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lock = require('../evidence-lock');
const T = lock.__testonly;

function mkRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-evlock-'));
  fs.mkdirSync(path.join(repo, '.claude', 'receipts', 'mccp-plan-codex'), { recursive: true });
  return repo;
}

function receiptTarget(repo, slug) {
  return path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', (slug || 'demo') + '.json');
}

function body(v) {
  return JSON.stringify({ receipt_hash: 'sha256:' + v, v: v }, null, 2) + '\n';
}

const ENV_A = { CLAUDE_CODE_SESSION_ID: 'sess-A', CLAUDE_PID: String(process.pid) };
const ENV_B = { CLAUDE_CODE_SESSION_ID: 'sess-B', CLAUDE_PID: String(process.pid) };

test('O_EXCL: a second acquire on a held lock cannot succeed', () => {
  const repo = mkRepo();
  const p = receiptTarget(repo);
  const lp = T.lockPathFor(p);
  const token = T.acquireLock(lp, { env: ENV_A });
  assert.ok(token, 'first acquire returns a token');
  assert.throws(
    () => T.acquireLock(lp, { env: ENV_B, maxRetries: 1, retryMs: 1, leaseMs: 60000 }),
    (e) => e.code === 'EVIDENCE_LOCK_UNAVAILABLE',
    'second acquire on a fresh live lock must fail-closed');
  T.releaseLock(lp, token);
});

test('fail-closed: EVIDENCE_LOCK_UNAVAILABLE carries path, lease and kill switch', () => {
  const repo = mkRepo();
  const lp = T.lockPathFor(receiptTarget(repo));
  const token = T.acquireLock(lp, { env: ENV_A });
  let err = null;
  try {
    T.acquireLock(lp, { env: ENV_B, maxRetries: 1, retryMs: 1, leaseMs: 60000 });
  } catch (e) { err = e; }
  assert.ok(err, 'must throw rather than silently proceed');
  assert.match(err.message, /lock:\s+\S+\.lock/, 'names the lock path');
  assert.match(err.message, /lease remaining/, 'reports remaining lease');
  assert.match(err.message, /MCCP_EVIDENCE_CONFLICT_GUARD=warn/, 'names the kill switch');
  T.releaseLock(lp, token);
});

test('Codex R1 F1: abandoned-live-lock is reclaimed (no permanent stall class)', () => {
  // holder PID is ALIVE (this process) but the critical section stalled, so the
  // lock mtime goes stale. pr-phase-lock's tri-state would NEVER reclaim this and,
  // combined with fail-closed, would block the receipt forever.
  const repo = mkRepo();
  const lp = T.lockPathFor(receiptTarget(repo));
  fs.writeFileSync(lp, JSON.stringify({
    pid: process.pid, host: os.hostname(), token: 'stale-token', started_at: 'x',
  }));
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lp, old, old);
  assert.equal(T.tryReclaimStaleLock(lp, 5000), true, 'lease expiry reclaims even a live PID');
  assert.equal(fs.existsSync(lp), false);
});

test('dead PID is reclaimed immediately, before the lease expires', () => {
  const repo = mkRepo();
  const lp = T.lockPathFor(receiptTarget(repo));
  // PID 1 exists on POSIX; use an implausible one and assert via isPidAlive.
  const deadPid = 2147483646;
  assert.equal(lock.isPidAlive(deadPid), false, 'precondition: pid is not alive');
  fs.writeFileSync(lp, JSON.stringify({ pid: deadPid, host: os.hostname(), token: 't' }));
  assert.equal(T.tryReclaimStaleLock(lp, 60000), true, 'dead holder reclaimed despite fresh lease');
});

test('cross-host lock is reclaimed immediately', () => {
  const repo = mkRepo();
  const lp = T.lockPathFor(receiptTarget(repo));
  fs.writeFileSync(lp, JSON.stringify({ pid: process.pid, host: 'some-other-host', token: 't' }));
  assert.equal(T.tryReclaimStaleLock(lp, 60000), true);
});

test('a fresh live same-host lock is NOT reclaimed inside its lease', () => {
  const repo = mkRepo();
  const lp = T.lockPathFor(receiptTarget(repo));
  const token = T.acquireLock(lp, { env: ENV_A });
  assert.equal(T.tryReclaimStaleLock(lp, 60000), false, 'live + fresh mtime must survive');
  T.releaseLock(lp, token);
});

test('release only unlinks when the token matches', () => {
  const repo = mkRepo();
  const lp = T.lockPathFor(receiptTarget(repo));
  const token = T.acquireLock(lp, { env: ENV_A });
  assert.equal(T.releaseLock(lp, 'not-my-token'), false, 'foreign token must not unlink');
  assert.ok(fs.existsSync(lp), 'lock survives a mismatched release');
  assert.equal(T.releaseLock(lp, token), true);
  assert.equal(fs.existsSync(lp), false);
});

test('tmp name ends in .tmp and is unique per call (gitignore glob + no tmp collision)', () => {
  const repo = mkRepo();
  const p = receiptTarget(repo);
  const a = T.tmpPathFor(p);
  const b = T.tmpPathFor(p);
  assert.ok(a.endsWith('.tmp'), 'must end in .tmp or it escapes the gitignore glob');
  assert.ok(T.lockPathFor(p).endsWith('.lock'), 'lock must end in .lock');
  assert.notEqual(a, b, 'a fixed tmp name would make concurrent writers collide');
  assert.ok(a.includes(String(process.pid)), 'tmp carries the pid');
});

test('writeFileAtomic leaves no tmp residue when rename fails', () => {
  const repo = mkRepo();
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  // Target a path whose parent is a FILE, so rename cannot succeed.
  const blocker = path.join(dir, 'blocker');
  fs.writeFileSync(blocker, 'x');
  const target = path.join(blocker, 'nested.json');
  assert.throws(() => T.writeFileAtomic(target, 'data', { maxRetries: 0 }));
  const residue = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(residue, [], 'no partial tmp may survive a failed rename');
});

test('rename retry re-checks ownership and aborts when it is lost (F5)', () => {
  const repo = mkRepo();
  const dir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  const blocker = path.join(dir, 'blocker2');
  fs.writeFileSync(blocker, 'x');
  const target = path.join(blocker, 'nested.json');
  let retries = 0;
  assert.throws(() => T.writeFileAtomic(target, 'data', {
    maxRetries: 5,
    retryMs: 1,
    onRetry: () => { retries++; return false; },   // ownership lost
  }));
  assert.ok(retries <= 1, 'losing ownership must stop the retry loop immediately, got ' + retries);
});

test('re-entrancy: nested acquisition of the same target throws', () => {
  const repo = mkRepo();
  const p = receiptTarget(repo);
  assert.throws(() => {
    lock.guardedWrite(p, () => {
      lock.guardedWrite(p, () => body('inner'), { env: ENV_A });
      return body('outer');
    }, { env: ENV_A });
  }, (e) => e.code === 'EVIDENCE_LOCK_REENTRANT');
});

test('guard events use receipt_hash vocabulary, not file-byte hashes', () => {
  // The B2 runtime audit snapshots {receipt_hash, mtime, size}; if guard events
  // carried byte hashes the correlation could never match.
  const repo = mkRepo();
  const p = receiptTarget(repo, 'vocab');
  lock.guardedWrite(p, () => body('one'), { env: ENV_A });
  const evDir = path.join(repo, '.claude', 'state', 'msw-events');
  const files = fs.readdirSync(evDir);
  const events = files.flatMap((f) => fs.readFileSync(path.join(evDir, f), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(JSON.parse));
  const guard = events.find((e) => e.kind === 'evidence_guard_active');
  assert.ok(guard, 'a guarded write emits evidence_guard_active');
  assert.equal(guard.pre_hash, null, 'no prior receipt → pre_hash null');
  assert.equal(guard.post_hash, 'sha256:one', 'post_hash is the receipt_hash, not a byte digest');
  assert.equal(guard.target, '.claude/receipts/mccp-plan-codex/vocab.json');
  assert.ok(guard.event_id, 'event carries a stable dedupe id');
});

test('CL-2 / R2 F1: a slow holder that lost the lock cannot overwrite the successor', () => {
  // A enters, B reclaims the lease and commits, then A's delayed write must be
  // REFUSED — this is exactly the lost update M3 exists to close.
  const repo = mkRepo();
  const p = receiptTarget(repo, 'slow');
  fs.writeFileSync(p, body('base'), 'utf8');

  let raced = false;
  assert.throws(() => {
    lock.guardedWrite(p, () => {
      if (!raced) {
        raced = true;
        // Simulate the successor committing while we were stalled.
        fs.writeFileSync(p, body('successor'), 'utf8');
      }
      return body('stale-writer');
    }, { env: ENV_A });
  }, (e) => e.code === 'EVIDENCE_OVERWRITE_OBSERVED', 'base-hash precondition must refuse the write');

  assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).v, 'successor',
    "the successor's content must survive");
});

test('warn mode observes without blocking; off mode is loud and unguarded', () => {
  const repo = mkRepo();
  const p = receiptTarget(repo, 'modes');
  fs.writeFileSync(p, body('base'), 'utf8');

  let raced = false;
  const r = lock.guardedWrite(p, () => {
    if (!raced) { raced = true; fs.writeFileSync(p, body('other'), 'utf8'); }
    return body('warned');
  }, { env: Object.assign({ MCCP_EVIDENCE_CONFLICT_GUARD: 'warn' }, ENV_A) });
  assert.equal(r.skipped, false, 'warn mode proceeds');
  assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).v, 'warned');

  const off = lock.guardedWrite(p, () => body('unguarded'),
    { env: Object.assign({ MCCP_EVIDENCE_CONFLICT_GUARD: 'off' }, ENV_A) });
  assert.equal(off.guarded, false, 'off mode reports that it did not guard');
});

test('parseGuardMode defaults to enforce and rejects typos loudly', () => {
  assert.equal(lock.parseGuardMode({}), 'enforce');
  assert.equal(lock.parseGuardMode({ MCCP_EVIDENCE_CONFLICT_GUARD: 'warn' }), 'warn');
  assert.equal(lock.parseGuardMode({ MCCP_EVIDENCE_CONFLICT_GUARD: 'OFF' }), 'off');
  assert.equal(lock.parseGuardMode({ MCCP_EVIDENCE_CONFLICT_GUARD: 'enforcce' }), 'enforce',
    'a typo must fail CLOSED, never silently disable the guard');
});

test('receipt-path detection drives the fence, not a caller flag', () => {
  const repo = mkRepo();
  assert.equal(lock.isReceiptPath(receiptTarget(repo)), true);
  assert.equal(lock.isReceiptPath(path.join(repo, '.claude', 'state', 'evidence-claims', 'x.json')), false);
  const d = lock.describeReceiptTarget(receiptTarget(repo, 'abc'));
  assert.equal(d.gateId, 'mccp-plan-codex');
  assert.equal(d.slug, 'abc');
});
