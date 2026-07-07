'use strict';

// v0.2.8 Task 2.6.1 R4-F2 absorption — pr-phase-lock boundary tests.
//
// v0.2.8 Task 2.6.1-FIX absorption (PR-Codex R1: F1+F2+F3+F4 + IMPL-Codex
// R1 host-aware, R2 token end-to-end, R3 textual cleanup):
//   - cmdExit and cmdHeartbeat REQUIRE both --run-id and --ownership-token
//     (missing or wrong = refuse, exit 16 / 15, no unlinkSync / utimesSync).
//   - cmdDetectStale NEVER takes a token — operates on host-aware lease
//     policy + zero-byte/unparseable mtime-only.
//   - cmdEnter uses fs.openSync(p,'wx') exclusive create; lockBody includes
//     host=os.hostname() + ownership_token=crypto.randomUUID(); enter stdout
//     returns the token so callers can capture it.
//   - computeMutations re-captures HEAD + write-tree against baseline; new
//     mutation reasons head-changed / index-changed.
//
// Axis catalog:
//   (a) read before enter → noop
//   (b)(b2)(b3) exit finalizer mutations (token-required)
//   (c) lock unlinked after correct-token exit; fresh enter ok
//   (d) detect-stale orphan reclaim — same-host + pid-dead path
//   (d2) live-PID + old-mtime → NOT stale (R1-F3 rewrite; was age-only)
//   (d3) cross-host + old-mtime → mtime-only reclaim
//   (d4) zero-byte body → mtime-only reclaim
//   (e) non-codex-review subphase → hook noop
//   (R4-F1) baseline_missing forces ok=false
//   (F4) wx exclusive create + ownership_token in stdout + concurrent enter
//   (F4-token) exit refuses missing-token / wrong-token / wrong-run-id
//   (F3-hb) heartbeat refuses missing-token / wrong-token / wrong-run-id
//   (F3-hb-ok) heartbeat with correct token updates mtime
//   (F2-head) commit-then-reset → head-changed mutation
//   (F2-index) git-add restage → index-changed mutation

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// v0.2.8 Task 2.6.1-followup F11 R3-F2 — existing boundary tests use the
// legacy --ownership-token argv form (in-process cmdExit/cmdHeartbeat calls,
// stdin not piped). Enable the test-only argv path so the production-contract
// gate doesn't reject them. Real-world callers MUST use stdin-pipe (F11
// dedicated test file covers that path).
process.env.MCCP_LOCK_TEST_ARGV_TOKEN = '1';

const lock = require('../pr-phase-lock');

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mccp-prphase-test-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  const buf = [];
  process.stdout.write = function (s) { buf.push(String(s)); return true; };
  let exitCode;
  try { exitCode = fn(); } finally { process.stdout.write = orig; }
  return { exitCode: exitCode, stdout: buf.join('') };
}

function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const buf = [];
  process.stderr.write = function (s) { buf.push(String(s)); return true; };
  let exitCode;
  try { exitCode = fn(); } finally { process.stderr.write = orig; }
  return { exitCode: exitCode, stderr: buf.join('') };
}

// enterAndCapture — invokes cmdEnter, parses the stdout JSON, returns
// { exitCode, runId, ownershipToken }. Used by every test that needs a
// token for subsequent heartbeat/exit calls.
function enterAndCapture(repo, opts) {
  const runId = (opts && opts.runId) || crypto.randomUUID();
  const args = Object.assign({
    cwd: repo,
    'run-id': runId,
    pid: String((opts && opts.pid) || process.pid),
  }, opts && opts.extra || {});
  const cap = captureStdout(function () { return lock.cmdEnter(args); });
  if (cap.exitCode !== 0) {
    return { exitCode: cap.exitCode, runId: runId, ownershipToken: null, raw: cap.stdout };
  }
  const parsed = JSON.parse(cap.stdout);
  return { exitCode: 0, runId: runId, ownershipToken: parsed.ownership_token, parsed: parsed };
}

// (a) Bash before lock enter → noop
test('(a) read before enter returns active=false', () => {
  const repo = mkTmpRepo();
  const r = captureStdout(function () {
    return lock.cmdRead({ cwd: repo });
  });
  assert.strictEqual(r.exitCode, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.active, false);
});

// (b) During subphase=codex-review, mutation detected by exit finalizer
test('(b) exit finalizer detects content mutation via dirty_content_hashes re-check', () => {
  const repo = mkTmpRepo();
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\nbaseline-state\n', 'utf8');
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0);
  assert.ok(entered.ownershipToken, 'enter must return ownership_token');
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\nmutated-state\n', 'utf8');
  const exit = captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': entered.runId, 'ownership-token': entered.ownershipToken,
    });
  });
  assert.strictEqual(exit.exitCode, 1);
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.baseline_missing, false);
  assert.ok(parsed.mutations.some(function (m) { return m.reason === 'content-changed-during-subphase'; }),
    'expected content-changed-during-subphase mutation, got: ' + JSON.stringify(parsed.mutations));
});

test('(b2) exit finalizer detects new untracked file via porcelain_z delta', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  fs.writeFileSync(path.join(repo, 'rogue.txt'), 'mid-subphase mutation\n', 'utf8');
  const exit = captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': entered.runId, 'ownership-token': entered.ownershipToken,
    });
  });
  assert.strictEqual(exit.exitCode, 1);
  const parsed = JSON.parse(exit.stdout);
  assert.ok(parsed.mutations.some(function (m) { return m.path === 'rogue.txt'; }),
    'rogue.txt should be in mutations list');
});

test('(b3) clean exit when no mutation occurred', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const exit = captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': entered.runId, 'ownership-token': entered.ownershipToken,
    });
  });
  assert.strictEqual(exit.exitCode, 0);
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.deepStrictEqual(parsed.mutations, []);
});

// (c) After exit, lock cleared → fresh enter ok
test('(c) lock unlinked after correct-token exit; fresh enter succeeds', () => {
  const repo = mkTmpRepo();
  const e1 = enterAndCapture(repo);
  captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': e1.runId, 'ownership-token': e1.ownershipToken,
    });
  });
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), false);
  const e2 = enterAndCapture(repo);
  assert.strictEqual(e2.exitCode, 0);
  assert.ok(e2.ownershipToken && e2.ownershipToken !== e1.ownershipToken,
    'second enter must mint a fresh ownership_token');
});

// (d) Crash recovery: same-host + pid-dead → reclaim
test('(d) detect-stale clears orphan lock (same-host + pid-dead)', () => {
  const repo = mkTmpRepo();
  const deadPid = 9999990;
  enterAndCapture(repo, { pid: deadPid });
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), true);
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '60000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.stale, true);
  assert.strictEqual(parsed.cleared, true);
  assert.strictEqual(parsed.reason, 'same-host-dead-pid');
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), false);
});

// (d2) v1.20.6 B#2 — live process.pid + STALE mtime → reclaim (PID-reuse
// imposter). Reverses the R6-F2/R1-F3 "live-PID + old mtime → NOT stale" rule:
// a live PID whose mtime lapsed past the lease is a reused-PID imposter (the
// genuine holder keeps mtime fresh via heartbeat), so it must be reclaimed.
test('(d2) detect-stale reclaims live-PID with STALE mtime (B#2 PID-reuse imposter)', () => {
  const repo = mkTmpRepo();
  enterAndCapture(repo, { pid: process.pid });
  const p = lock.lockPath(repo);
  // Force mtime backwards so age exceeds max-age-ms; PID is alive (us) but the
  // stale mtime marks it a PID-reuse imposter (heartbeat lapsed).
  const past = new Date(Date.now() - 3 * 60 * 1000);
  fs.utimesSync(p, past, past);
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '1000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.stale, true, 'live-PID + stale mtime must be reclaimed (B#2 imposter)');
  assert.strictEqual(parsed.cleared, true);
  assert.strictEqual(parsed.reason, 'same-host-stale-imposter');
  assert.strictEqual(parsed.pid_alive, true);
  assert.strictEqual(fs.existsSync(p), false, 'lock file must be unlinked');
});

// (d2') v1.20.6 B#2 — live process.pid + FRESH mtime → NOT stale (genuine
// live holder). The heartbeat keeps mtime fresh; this is the case the
// tiebreaker must still protect.
test("(d2') detect-stale REFUSES to reclaim live-PID with FRESH mtime (live holder)", () => {
  const repo = mkTmpRepo();
  enterAndCapture(repo, { pid: process.pid });
  const p = lock.lockPath(repo);
  // No mtime backdating — the lock is fresh (heartbeat healthy).
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '60000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.stale, false, 'live-PID + fresh mtime must NOT be marked stale');
  assert.strictEqual(parsed.reason, 'same-host-live-pid-fresh');
  assert.strictEqual(parsed.pid_alive, true);
  assert.strictEqual(fs.existsSync(p), true, 'lock file must remain in place');
});

// (d3) cross-host + old-mtime → mtime-only reclaim
test('(d3) detect-stale reclaims cross-host lock via mtime-only (R1-F1 host-aware)', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  const p = lock.lockPath(repo);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Manually craft a cross-host lock body
  fs.writeFileSync(p, JSON.stringify({
    run_id: runId,
    started_at: new Date().toISOString(),
    pid: process.pid,
    host: 'not-our-host-' + crypto.randomBytes(4).toString('hex'),
    ownership_token: crypto.randomUUID(),
    subphase: 'codex-review',
    baseline: { head_sha: 'x', index_tree: 'y', porcelain_z: '', dirty_content_hashes: {} },
  }, null, 2), 'utf8');
  const past = new Date(Date.now() - 3 * 60 * 1000);
  fs.utimesSync(p, past, past);
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '1000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.stale, true, 'cross-host + old mtime must be reclaimed');
  assert.strictEqual(parsed.cleared, true);
  assert.strictEqual(parsed.reason, 'cross-host-mtime-exceeded');
  assert.strictEqual(fs.existsSync(p), false);
});

// (d4) zero-byte body → mtime-only reclaim
test('(d4) detect-stale reclaims zero-byte body via mtime-only (R3-F2 fallthrough)', () => {
  const repo = mkTmpRepo();
  const p = lock.lockPath(repo);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '', 'utf8'); // zero-byte
  const past = new Date(Date.now() - 3 * 60 * 1000);
  fs.utimesSync(p, past, past);
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '1000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.stale, true);
  assert.strictEqual(parsed.cleared, true);
  assert.strictEqual(parsed.reason, 'zero-byte-mtime-exceeded');
  assert.strictEqual(fs.existsSync(p), false);
});

// (e) subphase != codex-review → lockActive treats as not-active
test('(e) lock with non-codex-review subphase is invisible to guard logic', () => {
  const repo = mkTmpRepo();
  enterAndCapture(repo, { extra: { subphase: 'some-other-subphase' } });
  const read = captureStdout(function () { return lock.cmdRead({ cwd: repo }); });
  const parsed = JSON.parse(read.stdout);
  assert.strictEqual(parsed.active, true);
  assert.strictEqual(parsed.subphase, 'some-other-subphase');
  const guard = require('../../hooks/pr-phase-guard');
  const result = guard.lockActive(lock, repo);
  assert.strictEqual(result, null, 'lockActive should return null when subphase != codex-review');
});

// Additional invariant: baseline_missing forces fail-stop
test('(R4-F1) baseline_missing forces ok=false on exit', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const p = lock.lockPath(repo);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    run_id: runId, pid: process.pid, subphase: 'codex-review',
    host: os.hostname(), ownership_token: token,
    started_at: new Date().toISOString(),
    // baseline missing
  }), 'utf8');
  const exit = captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': runId, 'ownership-token': token,
    });
  });
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.baseline_missing, true);
  assert.strictEqual(parsed.ok, false);
});

// ──────────────────────────────────────────────────────────────────
// F4 — wx exclusive create + ownership_token + concurrent enter
// ──────────────────────────────────────────────────────────────────

test('(F4) enter stdout returns ownership_token (non-empty UUID)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0);
  assert.ok(entered.ownershipToken, 'enter stdout must include ownership_token');
  assert.match(entered.ownershipToken, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'ownership_token must be a UUID');
});

test('(F4) enter writes host=os.hostname() into lockBody', () => {
  const repo = mkTmpRepo();
  enterAndCapture(repo);
  const body = JSON.parse(fs.readFileSync(lock.lockPath(repo), 'utf8'));
  assert.strictEqual(body.host, os.hostname());
});

test('(F4) concurrent enter refuses second when first is live', () => {
  const repo = mkTmpRepo();
  const e1 = enterAndCapture(repo, { pid: process.pid });
  assert.strictEqual(e1.exitCode, 0);
  const cap = captureStderr(function () {
    return lock.cmdEnter({
      cwd: repo,
      'run-id': crypto.randomUUID(),
      pid: String(process.pid),
    });
  });
  assert.strictEqual(cap.exitCode, 11, 'second concurrent enter must refuse');
  assert.match(cap.stderr, /not stale|already held/);
});

test('(F4) second enter succeeds after host-aware reclaim of dead-pid lock', () => {
  const repo = mkTmpRepo();
  enterAndCapture(repo, { pid: 9999990 });
  const e2 = enterAndCapture(repo, { pid: process.pid });
  assert.strictEqual(e2.exitCode, 0, 'second enter must succeed after dead-pid reclaim during EEXIST');
  assert.ok(e2.ownershipToken);
});

// ──────────────────────────────────────────────────────────────────
// F4 + R3-F1 — exit refuses missing-token / wrong-token
// ──────────────────────────────────────────────────────────────────

test('(F4-token) exit with missing --ownership-token refuses (exit 16) and does NOT unlink', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const cap = captureStderr(function () {
    return lock.cmdExit({ cwd: repo, 'run-id': entered.runId });
  });
  assert.strictEqual(cap.exitCode, 16);
  assert.match(cap.stderr, /requires --ownership-token/);
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), true,
    'lock must remain in place when exit refuses');
});

test('(F4-token) exit with WRONG --ownership-token refuses (exit 16) and does NOT unlink', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const cap = captureStderr(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': entered.runId,
      'ownership-token': 'wrong-' + crypto.randomUUID(),
    });
  });
  assert.strictEqual(cap.exitCode, 16);
  assert.match(cap.stderr, /ownership-token mismatch/);
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), true);
});

test('(F4-token) exit with WRONG --run-id refuses (exit 14)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const cap = captureStderr(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': 'wrong-run-id-' + crypto.randomUUID(),
      'ownership-token': entered.ownershipToken,
    });
  });
  assert.strictEqual(cap.exitCode, 14);
  assert.match(cap.stderr, /run_id mismatch/);
});

// ──────────────────────────────────────────────────────────────────
// F3 — cmdHeartbeat (R2-F1 + R3-F1)
// ──────────────────────────────────────────────────────────────────

test('(F3-hb-ok) heartbeat with correct run-id + token updates mtime', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const p = lock.lockPath(repo);
  const past = new Date(Date.now() - 90 * 1000); // 90s ago
  fs.utimesSync(p, past, past);
  const mtimeBefore = fs.statSync(p).mtimeMs;
  const cap = captureStdout(function () {
    return lock.cmdHeartbeat({
      cwd: repo, 'run-id': entered.runId, 'ownership-token': entered.ownershipToken,
    });
  });
  assert.strictEqual(cap.exitCode, 0);
  const parsed = JSON.parse(cap.stdout);
  assert.strictEqual(parsed.ok, true);
  const mtimeAfter = fs.statSync(p).mtimeMs;
  assert.ok(mtimeAfter > mtimeBefore, 'heartbeat must advance mtime');
});

test('(F3-hb) heartbeat with MISSING --ownership-token refuses (exit 15) and does NOT touch mtime', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const p = lock.lockPath(repo);
  const past = new Date(Date.now() - 90 * 1000);
  fs.utimesSync(p, past, past);
  const mtimeBefore = fs.statSync(p).mtimeMs;
  const cap = captureStderr(function () {
    return lock.cmdHeartbeat({ cwd: repo, 'run-id': entered.runId });
  });
  assert.strictEqual(cap.exitCode, 15);
  assert.match(cap.stderr, /requires --ownership-token/);
  const mtimeAfter = fs.statSync(p).mtimeMs;
  assert.strictEqual(mtimeAfter, mtimeBefore, 'mtime must NOT change on missing-token');
});

test('(F3-hb) heartbeat with WRONG --ownership-token refuses (exit 15)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const cap = captureStderr(function () {
    return lock.cmdHeartbeat({
      cwd: repo, 'run-id': entered.runId,
      'ownership-token': 'wrong-' + crypto.randomUUID(),
    });
  });
  assert.strictEqual(cap.exitCode, 15);
  assert.match(cap.stderr, /ownership-token mismatch/);
});

test('(F3-hb) heartbeat with WRONG --run-id refuses (exit 15)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const cap = captureStderr(function () {
    return lock.cmdHeartbeat({
      cwd: repo, 'run-id': 'wrong-run-id-' + crypto.randomUUID(),
      'ownership-token': entered.ownershipToken,
    });
  });
  assert.strictEqual(cap.exitCode, 15);
  assert.match(cap.stderr, /run_id mismatch/);
});

// ──────────────────────────────────────────────────────────────────
// F2 — head_sha / index_tree baseline diff
// ──────────────────────────────────────────────────────────────────

test('(F2-head) commit-then-reset triggers head-changed mutation', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  // Stage a new file + commit; porcelain_z delta is now empty (file is tracked
  // and committed) but head_sha has changed.
  fs.writeFileSync(path.join(repo, 'committed.txt'), 'staged + committed\n', 'utf8');
  execFileSync('git', ['add', 'committed.txt'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'mid-subphase commit', '--quiet'], { cwd: repo, stdio: 'ignore' });
  // Reset porcelain status (untracked → committed → reset doesn't restore the
  // pre-state, but the head_sha advance is what we're catching here).
  const exit = captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': entered.runId, 'ownership-token': entered.ownershipToken,
    });
  });
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.mutations.some(function (m) { return m.reason === 'head-changed'; }),
    'expected head-changed mutation: ' + JSON.stringify(parsed.mutations));
});

test('(F2-index) git-add stage without commit triggers index-changed mutation', () => {
  const repo = mkTmpRepo();
  fs.writeFileSync(path.join(repo, 'staged-later.txt'), 'pre-existing untracked\n', 'utf8');
  const entered = enterAndCapture(repo);
  // The file was untracked at baseline (in porcelain_z + dirty_content_hashes).
  // git add it mid-subphase — porcelain status changes from `??` to `A `, which
  // shows up in baseline porcelain_z but the index_tree advances. The
  // index-changed mutation catches this even if porcelain re-derived doesn't.
  execFileSync('git', ['add', 'staged-later.txt'], { cwd: repo, stdio: 'ignore' });
  const exit = captureStdout(function () {
    return lock.cmdExit({
      cwd: repo, 'run-id': entered.runId, 'ownership-token': entered.ownershipToken,
    });
  });
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.mutations.some(function (m) { return m.reason === 'index-changed'; }),
    'expected index-changed mutation: ' + JSON.stringify(parsed.mutations));
});

// v0.2.8 Task 2.6.1-followup F5 — lock file written with owner-only mode.
// Windows mode bits are not POSIX-style; NTFS doesn't model group/other —
// skip on win32 (lock file is still owner-default-secure via Windows ACL).
test('(F5) cmdEnter writes pr-phase.lock with owner-only mode (POSIX 0o600)', () => {
  if (process.platform === 'win32') return;
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0, 'enter must succeed');
  const lockFilePath = path.join(repo, '.claude', 'state', 'pr-phase.lock');
  const st = fs.statSync(lockFilePath);
  assert.strictEqual(st.mode & 0o077, 0,
    'pr-phase.lock should be 0o600 (owner-only) — got mode=0o' +
    (st.mode & 0o777).toString(8));
});

// v0.2.8 Task 2.6.1-followup F8 — symlink containment on lockDir.
// If .claude/state is symlinked outside the repo (worktree compromise or
// CI misconfiguration), cmdEnter must REFUSE before writing the lock body.
// assertContained throws PATH_ESCAPES_GATE; cmdEnter doesn't catch — so the
// throw propagates and the test asserts via assert.throws.
test('(F8) cmdEnter refuses when .claude/state is symlink out-of-tree (PATH_ESCAPES_GATE)', () => {
  if (process.platform === 'win32') return; // Windows symlink needs admin/dev mode
  const repo = mkTmpRepo();
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-prphase-external-'));
  try {
    fs.symlinkSync(external, path.join(repo, '.claude', 'state'));
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') return; // CI without symlink perm
    throw err;
  }
  assert.throws(function () {
    lock.cmdEnter({
      cwd: repo, 'run-id': crypto.randomUUID(), pid: String(process.pid),
    });
  }, function (err) {
    return err && err.code === 'PATH_ESCAPES_GATE'
      && /path escapes gate dir/.test(err.message);
  }, 'expected PATH_ESCAPES_GATE; lock body must not be written');
  // Defense-in-depth: confirm no lock file was created inside the external dir
  assert.strictEqual(fs.existsSync(path.join(external, 'pr-phase.lock')), false,
    'lock file must NOT be created in the external symlink target');
});

// v0.2.8 Task 2.6.1-followup F8 — non-symlink path (normal worktree) still works.
// Regression guard: assertContained must NOT false-positive on a happy-path
// .claude/state directory created by mkdirSync inside the repo.
test('(F8-happy) cmdEnter succeeds when .claude/state is a real directory inside repo', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0, 'happy-path enter must still succeed');
  assert.ok(entered.ownershipToken, 'enter must return ownership_token');
});
