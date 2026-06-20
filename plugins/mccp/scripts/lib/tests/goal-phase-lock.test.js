'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const lockMod = require('../goal-phase-lock');
const LOCK_JS = path.resolve(__dirname, '..', 'goal-phase-lock.js');

function withTempRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-goal-lock-'));
  try {
    execFileSync('git', ['init', '-q', dir], { encoding: 'utf8' });
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, 'README.md'), '# tmp\n', 'utf8');
    execFileSync('git', ['-C', dir, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'init', '--no-gpg-sign'], { encoding: 'utf8' });
    fs.mkdirSync(path.join(dir, '.claude', 'state'), { recursive: true });
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

function spawnLockCli(cwd, argv, opts) {
  opts = opts || {};
  return spawnSync('node', [LOCK_JS].concat(argv), {
    cwd: cwd, encoding: 'utf8',
    env: opts.env || process.env, input: opts.input,
  });
}

function lockBodyOf(cwd) {
  const p = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  if (!raw) return { _zero_byte: true };
  try { return JSON.parse(raw); } catch (e) { return { _parse_error: e.message }; }
}

function sidecarOf(cwd, runId) {
  const gitDir = execFileSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], {
    encoding: 'utf8',
  }).trim();
  return path.join(gitDir, 'mccp', 'tmp', 'goal-token-' + runId + '.dat');
}

// === S1: enter → exit normal flow ===

test('S1: enter → exit normal flow (sidecar token round-trip)', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const enter = spawnLockCli(cwd, [
      'enter', '--run-id', runId,
      '--milestone-id', 'm3',
      '--owner-session-id', 'sess-A',
    ]);
    assert.strictEqual(enter.status, 0, 'enter should succeed: ' + enter.stderr);
    const enterJson = JSON.parse(enter.stdout);
    assert.strictEqual(enterJson.ok, true);
    assert.strictEqual(enterJson.run_id, runId);
    assert.strictEqual(enterJson.milestone_id, 'm3');
    assert.strictEqual(enterJson.owner_session_id, 'sess-A');
    assert.ok(enterJson.ownership_token);
    assert.match(enterJson.ownership_token_hash, /^[0-9a-f]{64}$/);

    const sidecarPath = sidecarOf(cwd, runId);
    assert.ok(fs.existsSync(sidecarPath));
    const sidecarContent = fs.readFileSync(sidecarPath, 'utf8').trim();
    assert.strictEqual(sidecarContent, enterJson.ownership_token);

    const body = lockBodyOf(cwd);
    assert.strictEqual(body.run_id, runId);
    assert.strictEqual(body.milestone_id, 'm3');
    assert.strictEqual(body.ownership_token_hash, enterJson.ownership_token_hash);

    const exit = spawnLockCli(cwd, ['exit', '--run-id', runId]);
    assert.strictEqual(exit.status, 0, 'exit should succeed: ' + exit.stderr);
    assert.strictEqual(lockBodyOf(cwd), null);
    assert.ok(!fs.existsSync(sidecarPath));
  });
});

// === S2: concurrent enter race — single winner ===

test('S2: concurrent enter — second enter with different run-id gets exit 11', () => {
  withTempRepo((cwd) => {
    const runIdA = crypto.randomUUID();
    const runIdB = crypto.randomUUID();
    const first = spawnLockCli(cwd, ['enter', '--run-id', runIdA, '--pid', String(process.pid)]);
    assert.strictEqual(first.status, 0);
    const second = spawnLockCli(cwd, ['enter', '--run-id', runIdB]);
    assert.strictEqual(second.status, 11);
    assert.match(second.stderr, /lock held by another run/);
  });
});

// === S3: wrong sidecar token → exit refuses (16) + lock survives ===

test('S3: tampered sidecar token → exit returns 16, lock + sidecar survive', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const enter = spawnLockCli(cwd, ['enter', '--run-id', runId]);
    assert.strictEqual(enter.status, 0);

    const sidecarPath = sidecarOf(cwd, runId);
    fs.writeFileSync(sidecarPath, 'wrong-token-xxx', 'utf8');

    const exit = spawnLockCli(cwd, ['exit', '--run-id', runId]);
    assert.strictEqual(exit.status, 16);
    assert.ok(lockBodyOf(cwd));
    assert.ok(fs.existsSync(sidecarPath));
  });
});

// === S4: heartbeat valid + invalid ===

test('S4a: heartbeat valid token → mtime advances', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const enter = spawnLockCli(cwd, ['enter', '--run-id', runId]);
    assert.strictEqual(enter.status, 0);
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    const past = new Date(Date.now() - 5000);
    fs.utimesSync(lockPath, past, past);
    const before = fs.statSync(lockPath).mtimeMs;
    const hb = spawnLockCli(cwd, ['heartbeat', '--run-id', runId]);
    assert.strictEqual(hb.status, 0);
    const after = fs.statSync(lockPath).mtimeMs;
    assert.ok(after > before, 'heartbeat should refresh mtime forward');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

test('S4b: heartbeat with wrong sidecar token → exit 15, mtime unchanged', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId]);
    const sidecarPath = sidecarOf(cwd, runId);
    fs.writeFileSync(sidecarPath, 'wrong-token', 'utf8');
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    const before = fs.statSync(lockPath).mtimeMs;
    const hb = spawnLockCli(cwd, ['heartbeat', '--run-id', runId]);
    assert.strictEqual(hb.status, 15);
    const after = fs.statSync(lockPath).mtimeMs;
    assert.ok(Math.abs(after - before) < 100);
  });
});

// === S5: same-host + pid alive → NEVER reclaim ===

test('S5: detect-stale same-host + this-pid alive → stale=false', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId, '--pid', String(process.pid)]);
    const ds = spawnLockCli(cwd, ['detect-stale']);
    assert.strictEqual(ds.status, 0);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, false);
    assert.strictEqual(result.reason, 'same-host-live-pid');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

// === S6: same-host + dead pid → reclaim + sidecar swept ===

test('S6: detect-stale same-host + dead-pid → reclaim + sidecar swept', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const deadPid = 999999;
    spawnLockCli(cwd, ['enter', '--run-id', runId, '--pid', String(deadPid)]);
    const sidecarPath = sidecarOf(cwd, runId);
    assert.ok(fs.existsSync(sidecarPath));

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.cleared, true);
    assert.strictEqual(result.reason, 'same-host-dead-pid');
    assert.strictEqual(lockBodyOf(cwd), null);
    assert.ok(!fs.existsSync(sidecarPath));
  });
});

// === S7: cross-host policy ===

test('S7a: detect-stale cross-host + mtime within lease → not reclaimed', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId]);
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    const body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    body.host = 'other.example';
    fs.writeFileSync(lockPath, JSON.stringify(body, null, 2), 'utf8');

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, false);
    assert.strictEqual(result.reason, 'cross-host-mtime-within-lease');
  });
});

test('S7b: detect-stale cross-host + mtime exceeded → reclaim', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId]);
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    const body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    body.host = 'other.example';
    fs.writeFileSync(lockPath, JSON.stringify(body, null, 2), 'utf8');
    // Lease is 90s — push past 180s
    const past = new Date(Date.now() - 180 * 1000);
    fs.utimesSync(lockPath, past, past);

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'cross-host-mtime-exceeded');
  });
});

// === S8: 0-byte → mtime-only ===

test('S8: detect-stale zero-byte + mtime exceeded → reclaim', () => {
  withTempRepo((cwd) => {
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    fs.writeFileSync(lockPath, '', 'utf8');
    const past = new Date(Date.now() - 180 * 1000);
    fs.utimesSync(lockPath, past, past);

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'zero-byte-mtime-exceeded');
  });
});

// === S9: JSON parse error → mtime-only ===

test('S9: detect-stale JSON-corrupt + mtime exceeded → reclaim', () => {
  withTempRepo((cwd) => {
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    fs.writeFileSync(lockPath, '{not-json', 'utf8');
    const past = new Date(Date.now() - 180 * 1000);
    fs.utimesSync(lockPath, past, past);

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'parse-error-mtime-exceeded');
  });
});

// === S10: missing required field → mtime-only fallback path ===

test('S10: detect-stale lock missing ownership_token_hash → fallback through same-host check', () => {
  withTempRepo((cwd) => {
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      run_id: 'orphan', pid: 999999, host: os.hostname(),
    }, null, 2), 'utf8');
    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'same-host-dead-pid');
  });
});

// === S11: enter with --milestone-id + --owner-session-id → fields captured ===

test('S11: enter with --milestone-id + --owner-session-id → lock body + read JSON both surface fields', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, [
      'enter', '--run-id', runId,
      '--milestone-id', 'axis-C-m3',
      '--owner-session-id', 'sess-XYZ',
    ]);
    const body = lockBodyOf(cwd);
    assert.strictEqual(body.milestone_id, 'axis-C-m3');
    assert.strictEqual(body.owner_session_id, 'sess-XYZ');
    const read = spawnLockCli(cwd, ['read']);
    const readJson = JSON.parse(read.stdout);
    assert.strictEqual(readJson.milestone_id, 'axis-C-m3');
    assert.strictEqual(readJson.owner_session_id, 'sess-XYZ');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

// === S12: multi-turn heartbeat simulation (lease 90s + simulated 30s heartbeats) ===
// We can't actually sleep 90s — instead we (a) take the lock, (b) push mtime to
// past 80s ago, (c) heartbeat (mtime refreshes to now), (d) confirm detect-stale
// still sees fresh. This validates the heartbeat→mtime feedback loop works under
// 90s lease in the way a real multi-turn /goal loop would use it.

test('S12: multi-turn heartbeat simulation — lease 90s + heartbeats keep lock fresh', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId, '--pid', String(process.pid)]);
    const lockPath = path.join(cwd, '.claude', 'state', 'goal-phase.lock');

    for (let turn = 0; turn < 3; turn++) {
      // Simulate 80s of evaluator turn elapsing — still under 90s lease but close.
      const eighty = new Date(Date.now() - 80 * 1000);
      fs.utimesSync(lockPath, eighty, eighty);
      // Heartbeat refreshes mtime back to ~now.
      const hb = spawnLockCli(cwd, ['heartbeat', '--run-id', runId]);
      assert.strictEqual(hb.status, 0, 'heartbeat ' + turn + ' should succeed: ' + hb.stderr);
      const mtimeAfter = fs.statSync(lockPath).mtimeMs;
      assert.ok(Date.now() - mtimeAfter < 5000, 'heartbeat should reset mtime to ~now');
    }

    // After 3 heartbeats, detect-stale should NOT reclaim (same-host live pid).
    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, false);
    assert.strictEqual(result.reason, 'same-host-live-pid');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

// === S13: sidecar token file mode 0o600 (S1 security absorption) ===

test('S13: sidecar token file mode is 0o600 (POSIX)', { skip: process.platform === 'win32' }, () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId]);
    const sidecarPath = sidecarOf(cwd, runId);
    const mode = fs.statSync(sidecarPath).mode & 0o777;
    assert.strictEqual(mode, 0o600, 'sidecar token MUST be 0o600 (S1 absorption)');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

// === S14: cmdEnter sidecar mkdir EACCES → exit 19 + lock NOT created (H2 absorption) ===
// Inject failure via module's cmdEnter directly — we mock fs.mkdirSync to fail
// for the sidecar dir, then assert exit 19 + lock file not created.

test('S14: cmdEnter sidecar mkdir EACCES → exit 19 + lock not created', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const realMkdir = fs.mkdirSync;
    let calls = 0;
    fs.mkdirSync = function (dirPath, opts) {
      calls += 1;
      // First call is the lock dir; second call is the sidecar dir.
      // Mirror the lock-create real mkdir; fail on sidecar dir specifically.
      if (typeof dirPath === 'string' && dirPath.indexOf('mccp') !== -1 && dirPath.indexOf('tmp') !== -1) {
        const err = new Error('EACCES: permission denied');
        err.code = 'EACCES';
        throw err;
      }
      return realMkdir.call(fs, dirPath, opts);
    };
    let exitCode;
    let stderrCapture = '';
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = function (chunk) { stderrCapture += String(chunk); return true; };
    try {
      exitCode = lockMod.cmdEnter({ 'run-id': runId, cwd: cwd, pid: String(process.pid) });
    } finally {
      fs.mkdirSync = realMkdir;
      process.stderr.write = origStderrWrite;
    }
    assert.strictEqual(exitCode, 19);
    assert.match(stderrCapture, /sidecar dir mkdir failed/);
    // Lock should not exist (mkdir failure happens BEFORE openSync wx)
    assert.strictEqual(lockBodyOf(cwd), null, 'lock must not be created when sidecar mkdir fails');
  });
});

// === Unit: hashToken determinism + verifyTokenAgainstLock ===

test('hashToken: deterministic sha256', () => {
  assert.strictEqual(lockMod.hashToken('abc'), lockMod.hashToken('abc'));
  assert.notStrictEqual(lockMod.hashToken('abc'), lockMod.hashToken('xyz'));
});

test('verifyTokenAgainstLock: hash-match returns true', () => {
  const tok = 'sample-token';
  const body = { ownership_token_hash: lockMod.hashToken(tok) };
  assert.strictEqual(lockMod.verifyTokenAgainstLock(tok, body), true);
  assert.strictEqual(lockMod.verifyTokenAgainstLock('wrong', body), false);
  assert.strictEqual(lockMod.verifyTokenAgainstLock(tok, null), false);
  assert.strictEqual(lockMod.verifyTokenAgainstLock('', body), false);
});
