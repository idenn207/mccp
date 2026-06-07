'use strict';

// v0.2.8 Task 2.6.1 R4-F2 absorption — pr-phase-lock boundary tests.
//
// 5-axis (a-e) from plan §62:
//   (a) Bash before lock enter → noop (read returns active=false)
//   (b) During subphase=codex-review, mutation detected by exit finalizer
//       (porcelain delta + dirty_content_hashes 2-axis)
//   (c) After exit, lock cleared → fresh enter ok
//   (d) Crash recovery: entry, simulate orphan via pid override, detect-stale
//       runs finalizer + clears
//   (e) subphase != codex-review → hook noop (lockActive returns null)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

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
  // Make a file dirty before lock enter so it's in baseline dirty_content_hashes
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\nbaseline-state\n', 'utf8');
  const runId = crypto.randomUUID();
  const enter = captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(process.pid), branch: 'test' });
  });
  assert.strictEqual(enter.exitCode, 0);
  // Mutate the already-dirty file in-place (porcelain status unchanged but content differs)
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\nmutated-state\n', 'utf8');
  const exit = captureStdout(function () {
    return lock.cmdExit({ cwd: repo, 'run-id': runId });
  });
  // Mutations detected → exit code 1, ok=false
  assert.strictEqual(exit.exitCode, 1);
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.baseline_missing, false);
  assert.ok(parsed.mutations.some(function (m) { return m.reason === 'content-changed-during-subphase'; }),
    'expected content-changed-during-subphase mutation, got: ' + JSON.stringify(parsed.mutations));
});

test('(b2) exit finalizer detects new untracked file via porcelain_z delta', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(process.pid) });
  });
  // Create a new untracked file during the subphase
  fs.writeFileSync(path.join(repo, 'rogue.txt'), 'mid-subphase mutation\n', 'utf8');
  const exit = captureStdout(function () {
    return lock.cmdExit({ cwd: repo, 'run-id': runId });
  });
  assert.strictEqual(exit.exitCode, 1);
  const parsed = JSON.parse(exit.stdout);
  assert.ok(parsed.mutations.some(function (m) { return m.path === 'rogue.txt'; }),
    'rogue.txt should be in mutations list');
});

test('(b3) clean exit when no mutation occurred', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(process.pid) });
  });
  const exit = captureStdout(function () {
    return lock.cmdExit({ cwd: repo, 'run-id': runId });
  });
  assert.strictEqual(exit.exitCode, 0);
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.deepStrictEqual(parsed.mutations, []);
});

// (c) After exit, lock cleared → fresh enter ok
test('(c) lock unlinked after exit; fresh enter succeeds', () => {
  const repo = mkTmpRepo();
  const runId1 = crypto.randomUUID();
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId1, pid: String(process.pid) });
  });
  captureStdout(function () { return lock.cmdExit({ cwd: repo, 'run-id': runId1 }); });
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), false);
  const runId2 = crypto.randomUUID();
  const enter2 = captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId2, pid: String(process.pid) });
  });
  assert.strictEqual(enter2.exitCode, 0);
});

// (d) Crash recovery: enter, simulate orphan, detect-stale clears
test('(d) detect-stale clears orphan lock (pid-dead path)', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  // Use a PID that's almost certainly dead. PID 1 is init on Linux/macOS but
  // unlikely on Windows test runners. Use a high arbitrary unused PID.
  const deadPid = 9999990;
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(deadPid) });
  });
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), true);
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '60000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.stale, true);
  assert.strictEqual(parsed.cleared, true);
  assert.strictEqual(parsed.reason, 'pid-dead');
  assert.strictEqual(fs.existsSync(lock.lockPath(repo)), false);
});

test('(d2) detect-stale clears orphan lock (age-exceeded path)', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(process.pid) });
  });
  // Force mtime backwards so age exceeds max-age-ms
  const p = lock.lockPath(repo);
  const past = new Date(Date.now() - 3 * 60 * 1000);
  fs.utimesSync(p, past, past);
  const r = captureStdout(function () {
    return lock.cmdDetectStale({ cwd: repo, 'max-age-ms': '1000' });
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.stale, true);
  assert.strictEqual(parsed.cleared, true);
  assert.strictEqual(fs.existsSync(p), false);
});

// (e) subphase != codex-review → lockActive treats as not-active
test('(e) lock with non-codex-review subphase is invisible to guard logic', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(process.pid), subphase: 'some-other-subphase' });
  });
  // Read still returns active=true (raw lock exists)
  const read = captureStdout(function () { return lock.cmdRead({ cwd: repo }); });
  const parsed = JSON.parse(read.stdout);
  assert.strictEqual(parsed.active, true);
  assert.strictEqual(parsed.subphase, 'some-other-subphase');
  // But pr-phase-guard's lockActive helper should treat this as not-active because
  // it filters by SUBPHASE_DEFAULT.  We assert via the exported helper from the hook.
  const guard = require('../../hooks/pr-phase-guard');
  const helpers = guard;
  // lockActive() requires the lock module + cwd. The hook imports pr-phase-lock
  // internally so we just check that with subphase != codex-review the helper
  // returns null. Since lockActive is exported, we can call directly.
  const result = helpers.lockActive(lock, repo);
  assert.strictEqual(result, null, 'lockActive should return null when subphase != codex-review');
});

// Additional invariant: baseline_missing forces fail-stop
test('(R4-F1) baseline_missing forces ok=false on exit', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  // Write a malformed lock manually without baseline
  const p = lock.lockPath(repo);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    run_id: runId, pid: process.pid, subphase: 'codex-review',
    started_at: new Date().toISOString(),
    // baseline missing
  }), 'utf8');
  const exit = captureStdout(function () {
    return lock.cmdExit({ cwd: repo, 'run-id': runId });
  });
  const parsed = JSON.parse(exit.stdout);
  assert.strictEqual(parsed.baseline_missing, true);
  assert.strictEqual(parsed.ok, false);
});

// Run-id mismatch on exit refused
test('exit refuses when run-id mismatches', () => {
  const repo = mkTmpRepo();
  const runId = crypto.randomUUID();
  captureStdout(function () {
    return lock.cmdEnter({ cwd: repo, 'run-id': runId, pid: String(process.pid) });
  });
  const cap = captureStderr(function () {
    return lock.cmdExit({ cwd: repo, 'run-id': 'wrong-uuid' });
  });
  assert.strictEqual(cap.exitCode, 14);
  assert.match(cap.stderr, /run_id mismatch/);
});
