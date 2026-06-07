'use strict';

// codex-runner integration tests. Uses real pr-phase-lock.js CLI + a stub
// codex-invoke.js to validate the orchestration: lock enter → outcome
// branching (skip / dedupe / invoke) → lock exit → mutations capture.
//
// F11 R3-F2 contract: token must NEVER appear in any child process's argv.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RUNNER = path.resolve(__dirname, '..', '..', 'pr-phase-helpers', 'codex-runner.js');
const LOCK_CLI = path.resolve(__dirname, '..', '..', 'pr-phase-lock.js');
const NODE = process.execPath;

function mkTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-runner-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function writeStub(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

const STUB_CODEX_OK = [
  '#!/usr/bin/env node',
  '"use strict";',
  // Emit a minimal "ok" response shape that codex-runner expects.
  'process.stdout.write(JSON.stringify({',
  '  classification: "ok",',
  '  blocking: false,',
  '  rounds: 1,',
  '  findings: [],',
  '  summary: "stub-codex-ok"',
  '}));',
  'process.exit(0);',
].join('\n');

const STUB_CODEX_FINDINGS = STUB_CODEX_OK.replace(
  'findings: []', 'findings: [{ severity: "MEDIUM", msg: "stub finding" }]');

const STUB_CODEX_BLOCKING = [
  '#!/usr/bin/env node',
  '"use strict";',
  'process.stdout.write(JSON.stringify({',
  '  classification: "stdout-empty",',
  '  blocking: true,',
  '}));',
  'process.exit(12);',
].join('\n');

test('codex-runner dedupe path: short-circuits Codex, lock enter+exit clean', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--dedupe',
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--cwd', repo,
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'dedupe + clean exit returns 0: ' + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_outcome, 'deduped');
  assert.strictEqual(out.codex_rounds, 0);
  assert.strictEqual(out.lock_exit_ok, true);
  assert.strictEqual(out.mutations.length, 0);
  assert.match(out.codex_summary, /cross-gate dedupe/);
});

test('codex-runner skip path: --skip-reason sets outcome=skipped, no codex call', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--skip-reason', 'codex registry stale; out-of-band verification done',
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--cwd', repo,
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_outcome, 'skipped');
  assert.match(out.codex_skip_reason, /codex registry stale/);
});

test('codex-runner invoke path: stub codex-ok → lock_exit_ok=true, no mutations', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_OK);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000',  // suppress real heartbeats during fast test
    '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, 'invoke + clean exit returns 0: ' + r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_outcome, 'invoked');
  assert.strictEqual(out.lock_exit_ok, true);
  assert.strictEqual(out.codex_actionable_findings, false);
  assert.strictEqual(out.mutations.length, 0);
  // Lock unlinked
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')));
});

test('codex-runner invoke path: stub findings → codex_actionable_findings=true', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_FINDINGS);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000',
    '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.codex_actionable_findings, true);
});

test('codex-runner invoke path: stub blocking → fail-stop with cleanup', () => {
  const repo = mkTmpRepo();
  const stub = writeStub(repo, 'fake-codex.js', STUB_CODEX_BLOCKING);
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--codex-invoke', stub,
    '--lock-cli', LOCK_CLI,
    '--heartbeat-ms', '60000',
    '--cwd', repo,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.notStrictEqual(r.status, 0, 'blocking response → non-zero exit');
  assert.match(r.stderr, /codex review failed/);
  // Lock must be released even on fail-stop
  assert.ok(!fs.existsSync(path.join(repo, '.claude', 'state', 'pr-phase.lock')),
    'cleanup released the lock');
});

test('codex-runner: missing required args fail with clear stderr', () => {
  const r = spawnSync(NODE, [RUNNER, '--base', 'main'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--decision/);
});

test('codex-runner emits helper_manifest in output (F10 R2-F1 propagation)', () => {
  const repo = mkTmpRepo();
  const bodyFile = path.join(repo, '.git', 'mccp', 'tmp', 'body.md');
  fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
  const r = spawnSync(NODE, [RUNNER,
    '--base', 'master',
    '--decision', 'demo',
    '--body-file', bodyFile,
    '--dedupe',
    '--lock-cli', LOCK_CLI,
    '--cwd', repo,
  ], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(typeof out.helper_manifest, 'object');
  // Manifest should at minimum contain stdout-pipe-ipc and codex-runner itself
  const hasStdoutPipe = Object.keys(out.helper_manifest).some(function (k) {
    return /stdout-pipe-ipc\.js$/.test(k);
  });
  assert.ok(hasStdoutPipe, 'helper_manifest contains stdout-pipe-ipc.js');
});
