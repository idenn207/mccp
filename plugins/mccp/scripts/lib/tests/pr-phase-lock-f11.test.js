'use strict';

// v0.2.8 Task 2.6.1-followup F11 — token storage migration + stdin-pipe IPC.
//
// Coverage:
//   lockBody.ownership_token_hash (sha256 hex), no raw token in lock body
//   cmdEnter stdout still returns raw ownership_token (R3-F2 anonymous pipe)
//   cmdEnter stdout returns helper_manifest (F10 R2-F1 content-hash gate)
//   cmdExit / cmdHeartbeat refuse raw --ownership-token argv in production (exit 17)
//   cmdExit / cmdHeartbeat accept --ownership-token-stdin via spawnSync input pipe
//   cmdEnter R2-F2 pre-check reclaims legacy v0.2.7 lock body (raw token, no hash)
//   verifyTokenAgainstLock handles legacy + new schemas

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const lock = require('../pr-phase-lock');

const LOCK_CLI = path.resolve(__dirname, '..', 'pr-phase-lock.js');
const NODE = process.execPath;

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-prphase-f11-'));
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

function enterAndCapture(repo, opts) {
  const runId = (opts && opts.runId) || crypto.randomUUID();
  const args = Object.assign({
    cwd: repo,
    'run-id': runId,
    pid: String((opts && opts.pid) || process.pid),
  }, opts && opts.extra || {});
  const cap = captureStdout(function () { return lock.cmdEnter(args); });
  return { exitCode: cap.exitCode, runId: runId, parsed: cap.stdout ? JSON.parse(cap.stdout) : null };
}

test('F11 lockBody stores ownership_token_hash (sha256 hex), NOT raw ownership_token', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0);
  const body = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'state', 'pr-phase.lock'), 'utf8'));
  assert.ok(body.ownership_token_hash, 'lock body must have ownership_token_hash');
  assert.match(body.ownership_token_hash, /^[0-9a-f]{64}$/, 'must be 64-char hex');
  assert.strictEqual(body.ownership_token, undefined, 'raw ownership_token must NOT be in lock body');
});

test('F11 cmdEnter stdout returns raw ownership_token + helper_manifest', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0);
  assert.ok(entered.parsed.ownership_token, 'stdout must return raw token');
  assert.match(entered.parsed.ownership_token,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'UUID v4 shape');
  assert.ok(entered.parsed.ownership_token_hash, 'stdout exposes hash too');
  const expectedHash = crypto.createHash('sha256').update(entered.parsed.ownership_token, 'utf8').digest('hex');
  assert.strictEqual(entered.parsed.ownership_token_hash, expectedHash, 'hash must match raw token sha256');
  assert.ok(entered.parsed.helper_manifest, 'helper_manifest in stdout');
  assert.strictEqual(typeof entered.parsed.helper_manifest, 'object');
});

test('F10 helper_manifest contains stdout-pipe-ipc.js content hash', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0);
  const manifest = entered.parsed.helper_manifest;
  const stdoutPipePath = Object.keys(manifest).find(function (k) {
    return /stdout-pipe-ipc\.js$/.test(k);
  });
  assert.ok(stdoutPipePath, 'manifest should list stdout-pipe-ipc.js');
  assert.match(manifest[stdoutPipePath], /^sha256:[0-9a-f]{64}$/, 'sha256:hex format');
});

test('F10 helper_manifest is content-aware — modifying a helper changes its hash', () => {
  const repo = mkTmpRepo();
  // Stage a synthetic helper dir to demonstrate content-aware hashing.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-helpers-'));
  const helpersDir = path.join(tmpRoot, 'scripts', 'lib', 'pr-phase-helpers');
  fs.mkdirSync(helpersDir, { recursive: true });
  fs.writeFileSync(path.join(helpersDir, 'fake-helper.js'), '// v1\n', 'utf8');
  const m1 = lock.buildHelperManifest(helpersDir);
  fs.writeFileSync(path.join(helpersDir, 'fake-helper.js'), '// v2 changed\n', 'utf8');
  const m2 = lock.buildHelperManifest(helpersDir);
  const k = Object.keys(m1)[0];
  assert.ok(k, 'manifest had one entry');
  assert.notStrictEqual(m1[k], m2[k], 'hash changes with content');
});

test('F10 helper_manifest tolerates missing helpers dir (empty manifest)', () => {
  const m = lock.buildHelperManifest('/path/that/does/not/exist/xyz123');
  assert.deepStrictEqual(m, {}, 'missing dir → empty manifest');
});

test('F11 cmdExit refuses raw --ownership-token argv in production (exit 17, no MCCP_LOCK_TEST_ARGV_TOKEN)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const tok = entered.parsed.ownership_token;
  const env = Object.assign({}, process.env);
  delete env.MCCP_LOCK_TEST_ARGV_TOKEN;
  const r = spawnSync(NODE, [LOCK_CLI, 'exit', '--run-id', entered.runId,
    '--ownership-token', tok, '--cwd', repo], {
    encoding: 'utf8', env: env,
  });
  assert.strictEqual(r.status, 17, 'argv-form must exit 17 in production');
  assert.match(r.stderr, /refuses raw --ownership-token argv|stdin-pipe only/);
  // Lock must NOT be unlinked.
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')));
});

test('F11 cmdExit accepts --ownership-token-stdin (production contract path)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const tok = entered.parsed.ownership_token;
  const env = Object.assign({}, process.env);
  delete env.MCCP_LOCK_TEST_ARGV_TOKEN;
  const r = spawnSync(NODE, [LOCK_CLI, 'exit', '--run-id', entered.runId,
    '--ownership-token-stdin', '--cwd', repo], {
    encoding: 'utf8', env: env, input: tok + '\n',
  });
  assert.strictEqual(r.status, 0, 'stdin-pipe production contract succeeds: ' + r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')),
    'correct exit unlinks the lock');
});

test('F11 cmdHeartbeat refuses raw --ownership-token argv in production (exit 17)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const tok = entered.parsed.ownership_token;
  const env = Object.assign({}, process.env);
  delete env.MCCP_LOCK_TEST_ARGV_TOKEN;
  const r = spawnSync(NODE, [LOCK_CLI, 'heartbeat', '--run-id', entered.runId,
    '--ownership-token', tok, '--cwd', repo], {
    encoding: 'utf8', env: env,
  });
  assert.strictEqual(r.status, 17);
  assert.match(r.stderr, /refuses raw --ownership-token argv|stdin-pipe only/);
});

test('F11 cmdHeartbeat accepts --ownership-token-stdin (production contract path)', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const tok = entered.parsed.ownership_token;
  const env = Object.assign({}, process.env);
  delete env.MCCP_LOCK_TEST_ARGV_TOKEN;
  const r = spawnSync(NODE, [LOCK_CLI, 'heartbeat', '--run-id', entered.runId,
    '--ownership-token-stdin', '--cwd', repo], {
    encoding: 'utf8', env: env, input: tok + '\n',
  });
  assert.strictEqual(r.status, 0, 'stdin-pipe heartbeat OK: ' + r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
});

test('F11 cmdExit with WRONG token via stdin → exit 16, lock preserved', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const env = Object.assign({}, process.env);
  delete env.MCCP_LOCK_TEST_ARGV_TOKEN;
  const r = spawnSync(NODE, [LOCK_CLI, 'exit', '--run-id', entered.runId,
    '--ownership-token-stdin', '--cwd', repo], {
    encoding: 'utf8', env: env, input: 'wrong-token-via-stdin\n',
  });
  assert.strictEqual(r.status, 16);
  assert.match(r.stderr, /token mismatch/);
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')));
});

test('F11 cmdExit with empty stdin → exit 16, lock preserved', () => {
  const repo = mkTmpRepo();
  const entered = enterAndCapture(repo);
  const env = Object.assign({}, process.env);
  delete env.MCCP_LOCK_TEST_ARGV_TOKEN;
  const r = spawnSync(NODE, [LOCK_CLI, 'exit', '--run-id', entered.runId,
    '--ownership-token-stdin', '--cwd', repo], {
    encoding: 'utf8', env: env, input: '',
  });
  assert.strictEqual(r.status, 16);
  assert.match(r.stderr, /requires --ownership-token-stdin/);
});

test('F11 R2-F2 cmdEnter pre-check reclaims legacy v0.2.7 lock body (raw token + dead PID)', () => {
  const repo = mkTmpRepo();
  // Fabricate a legacy v0.2.7 lock body: raw ownership_token, no hash,
  // same-host but dead PID (use a PID likely-dead — e.g. 999999).
  const lockFilePath = path.join(repo, '.claude', 'state', 'pr-phase.lock');
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });
  const legacy = {
    run_id: 'legacy-027-run',
    started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    pid: 999999,
    host: os.hostname(),
    ownership_token: 'legacy-raw-uuid-no-hash',
    branch: 'main',
    subphase: 'codex-review',
    baseline: {},
  };
  fs.writeFileSync(lockFilePath, JSON.stringify(legacy, null, 2));
  // Fresh enter should succeed because R2-F2 pre-check reclaimed the dead-PID legacy lock.
  const entered = enterAndCapture(repo);
  assert.strictEqual(entered.exitCode, 0, 'pre-check should clear orphan legacy lock');
  const body = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
  assert.ok(body.ownership_token_hash, 'new lock uses hash schema');
  assert.notStrictEqual(body.run_id, 'legacy-027-run', 'lock was replaced not preserved');
});

test('F11 R2-F2 cmdEnter pre-check does NOT reclaim legacy lock when same-host PID is alive', () => {
  const repo = mkTmpRepo();
  const lockFilePath = path.join(repo, '.claude', 'state', 'pr-phase.lock');
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });
  const legacy = {
    run_id: 'legacy-027-alive',
    started_at: new Date().toISOString(),
    pid: process.pid,
    host: os.hostname(),
    ownership_token: 'legacy-raw-uuid-no-hash',
    branch: 'main',
    subphase: 'codex-review',
    baseline: {},
  };
  fs.writeFileSync(lockFilePath, JSON.stringify(legacy, null, 2));
  const entered = enterAndCapture(repo);
  // Live-PID protection wins — fresh enter refuses with exit 11.
  assert.strictEqual(entered.exitCode, 11, 'live-PID legacy lock must NOT be reclaimed');
  const body = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
  assert.strictEqual(body.run_id, 'legacy-027-alive', 'lock body preserved');
});

test('F11 verifyTokenAgainstLock handles both new (hash) and legacy (raw) lock bodies', () => {
  const tok = 'abc-1234-xyz';
  const tokHash = lock.hashToken(tok);
  // New schema
  assert.strictEqual(lock.verifyTokenAgainstLock(tok, { ownership_token_hash: tokHash }), true);
  assert.strictEqual(lock.verifyTokenAgainstLock('wrong', { ownership_token_hash: tokHash }), false);
  // Legacy v0.2.7 schema
  assert.strictEqual(lock.verifyTokenAgainstLock(tok, { ownership_token: tok }), true);
  assert.strictEqual(lock.verifyTokenAgainstLock('wrong', { ownership_token: tok }), false);
  // Both fields → hash takes precedence
  assert.strictEqual(lock.verifyTokenAgainstLock(tok,
    { ownership_token_hash: tokHash, ownership_token: 'something-else' }), true);
  // Neither field → false
  assert.strictEqual(lock.verifyTokenAgainstLock(tok, {}), false);
  // Bad inputs
  assert.strictEqual(lock.verifyTokenAgainstLock('', { ownership_token_hash: tokHash }), false);
  assert.strictEqual(lock.verifyTokenAgainstLock(tok, null), false);
});

test('F11 hashToken is deterministic + lowercase hex', () => {
  const a = lock.hashToken('foo');
  const b = lock.hashToken('foo');
  assert.strictEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(a, lock.hashToken('bar'));
});
