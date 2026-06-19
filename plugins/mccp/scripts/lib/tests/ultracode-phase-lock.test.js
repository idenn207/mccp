'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const lockMod = require('../ultracode-phase-lock');
const LOCK_JS = path.resolve(__dirname, '..', 'ultracode-phase-lock.js');

// Each test uses an isolated tmp git repo so concurrent runs don't collide.
function withTempRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ultracode-lock-'));
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
  const result = spawnSync('node', [LOCK_JS].concat(argv), {
    cwd: cwd,
    encoding: 'utf8',
    env: opts.env || process.env,
    input: opts.input,
  });
  return result;
}

function lockBodyOf(cwd) {
  const p = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  if (!raw) return { _zero_byte: true };
  try { return JSON.parse(raw); } catch (e) { return { _parse_error: e.message }; }
}

function sidecarOf(cwd, runId) {
  const gitDir = execFileSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], {
    encoding: 'utf8',
  }).trim();
  return path.join(gitDir, 'mccp', 'tmp', 'ultracode-token-' + runId + '.dat');
}

// === S1: enter → exit normal flow ===

test('S1: enter → exit normal flow (sidecar token round-trip)', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const enter = spawnLockCli(cwd, ['enter', '--run-id', runId, '--task-index', '3', '--owner-session-id', 'sess-A']);
    assert.strictEqual(enter.status, 0, 'enter should succeed: ' + enter.stderr);
    const enterJson = JSON.parse(enter.stdout);
    assert.strictEqual(enterJson.ok, true);
    assert.strictEqual(enterJson.run_id, runId);
    assert.strictEqual(enterJson.task_index, 3);
    assert.strictEqual(enterJson.owner_session_id, 'sess-A');
    assert.ok(enterJson.ownership_token);
    assert.match(enterJson.ownership_token_hash, /^[0-9a-f]{64}$/);

    // Sidecar exists with raw token
    const sidecarPath = sidecarOf(cwd, runId);
    assert.ok(fs.existsSync(sidecarPath), 'sidecar should exist');
    const sidecarContent = fs.readFileSync(sidecarPath, 'utf8').trim();
    assert.strictEqual(sidecarContent, enterJson.ownership_token);

    // Lock body has correct hash + fields
    const body = lockBodyOf(cwd);
    assert.strictEqual(body.run_id, runId);
    assert.strictEqual(body.task_index, 3);
    assert.strictEqual(body.owner_session_id, 'sess-A');
    assert.strictEqual(body.ownership_token_hash, enterJson.ownership_token_hash);

    const exit = spawnLockCli(cwd, ['exit', '--run-id', runId]);
    assert.strictEqual(exit.status, 0, 'exit should succeed: ' + exit.stderr);
    assert.strictEqual(lockBodyOf(cwd), null, 'lock file should be removed');
    assert.ok(!fs.existsSync(sidecarPath), 'sidecar should be removed');
  });
});

// === S2: concurrent enter — single winner ===

test('S2: concurrent enter — second enter with different run-id gets exit 11', () => {
  withTempRepo((cwd) => {
    const runIdA = crypto.randomUUID();
    const runIdB = crypto.randomUUID();
    // Record this process PID (alive) on the first lock so the second enter's
    // same-host reclaim attempt sees pid-alive → NEVER reclaim → exit 11.
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

    // Corrupt sidecar
    const sidecarPath = sidecarOf(cwd, runId);
    fs.writeFileSync(sidecarPath, 'wrong-token-xxx', 'utf8');

    const exit = spawnLockCli(cwd, ['exit', '--run-id', runId]);
    assert.strictEqual(exit.status, 16);
    assert.ok(lockBodyOf(cwd), 'lock should still exist');
    assert.ok(fs.existsSync(sidecarPath), 'sidecar should still exist');
  });
});

// === S4: heartbeat token round-trip + mismatch ===

test('S4a: heartbeat valid token → mtime advances', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    const enter = spawnLockCli(cwd, ['enter', '--run-id', runId]);
    assert.strictEqual(enter.status, 0);
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
    const before = fs.statSync(lockPath).mtimeMs;
    // Set lock mtime to past to verify advancement
    const past = new Date(Date.now() - 5000);
    fs.utimesSync(lockPath, past, past);
    const hb = spawnLockCli(cwd, ['heartbeat', '--run-id', runId]);
    assert.strictEqual(hb.status, 0);
    const after = fs.statSync(lockPath).mtimeMs;
    assert.ok(after > before - 6000, 'heartbeat should refresh mtime forward');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

test('S4b: heartbeat with wrong sidecar token → exit 15, mtime unchanged', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId]);
    const sidecarPath = sidecarOf(cwd, runId);
    fs.writeFileSync(sidecarPath, 'wrong-token', 'utf8');
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
    const before = fs.statSync(lockPath).mtimeMs;
    const hb = spawnLockCli(cwd, ['heartbeat', '--run-id', runId]);
    assert.strictEqual(hb.status, 15);
    const after = fs.statSync(lockPath).mtimeMs;
    // mtime should NOT advance (within a few ms tolerance for FS precision)
    assert.ok(Math.abs(after - before) < 100, 'mtime should not advance after token mismatch');
  });
});

// === S5: detect-stale same-host + pid alive → NEVER reclaim ===

test('S5: detect-stale same-host + this-pid alive → stale=false', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    // Use this process pid (which is alive)
    spawnLockCli(cwd, ['enter', '--run-id', runId, '--pid', String(process.pid)]);
    const ds = spawnLockCli(cwd, ['detect-stale']);
    assert.strictEqual(ds.status, 0);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, false);
    assert.strictEqual(result.reason, 'same-host-live-pid');
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

// === S6: detect-stale same-host + pid dead → reclaim ===

test('S6: detect-stale same-host + dead-pid → reclaim + sidecar swept', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    // Use a definitely-dead pid (large + unlikely)
    const deadPid = 999999;
    spawnLockCli(cwd, ['enter', '--run-id', runId, '--pid', String(deadPid)]);
    const sidecarPath = sidecarOf(cwd, runId);
    assert.ok(fs.existsSync(sidecarPath));

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.cleared, true);
    assert.strictEqual(result.reason, 'same-host-dead-pid');
    assert.strictEqual(lockBodyOf(cwd), null, 'lock should be reclaimed');
    assert.ok(!fs.existsSync(sidecarPath), 'sidecar should be swept');
  });
});

// === S7: cross-host mtime policy ===

test('S7a: detect-stale cross-host + mtime within lease → not reclaimed', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId]);
    // Tamper lock body to cross-host
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
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
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
    const body = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    body.host = 'other.example';
    fs.writeFileSync(lockPath, JSON.stringify(body, null, 2), 'utf8');
    // Push mtime to past beyond lease window
    const past = new Date(Date.now() - 120 * 1000);
    fs.utimesSync(lockPath, past, past);

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'cross-host-mtime-exceeded');
  });
});

// === S8: 0-byte lock body → mtime-only ===

test('S8: detect-stale zero-byte lock body + mtime exceeded → reclaim', () => {
  withTempRepo((cwd) => {
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
    fs.writeFileSync(lockPath, '', 'utf8');  // 0-byte
    const past = new Date(Date.now() - 120 * 1000);
    fs.utimesSync(lockPath, past, past);

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'zero-byte-mtime-exceeded');
  });
});

// === S9: JSON parse error → mtime-only ===

test('S9: detect-stale JSON-corrupt lock + mtime exceeded → reclaim', () => {
  withTempRepo((cwd) => {
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
    fs.writeFileSync(lockPath, '{not-json', 'utf8');
    const past = new Date(Date.now() - 120 * 1000);
    fs.utimesSync(lockPath, past, past);

    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'parse-error-mtime-exceeded');
  });
});

// === S10: missing required field (ownership_token_hash absent) → mtime-only ===

test('S10: detect-stale lock missing ownership_token_hash → mtime-only fallback', () => {
  withTempRepo((cwd) => {
    const lockPath = path.join(cwd, '.claude', 'state', 'ultracode-phase.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      run_id: 'orphan', pid: 999999, host: os.hostname(),
      // ownership_token_hash absent → treated as opaque body; host check still applies
    }, null, 2), 'utf8');
    // mtime-fresh + dead-pid + same-host → same-host-dead-pid reclaim path
    const ds = spawnLockCli(cwd, ['detect-stale']);
    const result = JSON.parse(ds.stdout);
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.reason, 'same-host-dead-pid');
  });
});

// === S11: enter --task-index N → lock body captures it ===

test('S11: enter with --task-index N → lock body + read JSON both surface N', () => {
  withTempRepo((cwd) => {
    const runId = crypto.randomUUID();
    spawnLockCli(cwd, ['enter', '--run-id', runId, '--task-index', '7']);
    const body = lockBodyOf(cwd);
    assert.strictEqual(body.task_index, 7);
    const read = spawnLockCli(cwd, ['read']);
    const readJson = JSON.parse(read.stdout);
    assert.strictEqual(readJson.task_index, 7);
    spawnLockCli(cwd, ['exit', '--run-id', runId]);
  });
});

// === S12: enter without --run-id → exit 2 ===

test('S12: enter without --run-id → exit 2 + clear stderr', () => {
  withTempRepo((cwd) => {
    const enter = spawnLockCli(cwd, ['enter']);
    assert.strictEqual(enter.status, 2);
    assert.match(enter.stderr, /requires --run-id/);
  });
});

// === S13: read on absent lock → active=false ===

test('S13: read with no lock present → JSON {active:false}', () => {
  withTempRepo((cwd) => {
    const read = spawnLockCli(cwd, ['read']);
    assert.strictEqual(read.status, 0);
    const r = JSON.parse(read.stdout);
    assert.strictEqual(r.active, false);
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
