'use strict';

// T-Session-Bootstrap regression — exercises session-start.js end-to-end via
// spawnSync. Validates that state-injector wiring (S10a) preserves the
// pre-existing SessionStart behavior and does not block startup on injector
// exceptions.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const sw = require('../../state/state-writer');
const ft = require('../../state/fix-task');

const SESSION_START = path.resolve(__dirname, '..', 'session-start.js');

function mkRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-t-session-bootstrap-'));
  execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

function runSessionStart(repo, envOverrides) {
  const r = spawnSync(process.execPath, [SESSION_START], {
    cwd: repo,
    input: '{"session_id":"test"}',
    encoding: 'utf8',
    timeout: 15000,
    env: Object.assign({}, process.env, envOverrides || {}),
  });
  return r;
}

test('session-start exits 0 when STATE.md and fix-task are both missing', () => {
  const repo = mkRepo();
  const r = runSessionStart(repo);
  assert.strictEqual(r.status, 0, 'exit non-zero: stderr=' + r.stderr);
});

test('session-start injects STATE.md content into additionalContext payload', () => {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'precompact',
    taskFingerprint: 'tsb1',
    goal: 'restored goal token',
    nextStep: 'continue session',
  });
  const r = runSessionStart(repo);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /\[mccp:STATE\.md — restored from previous session\]/);
  assert.match(r.stdout, /restored goal token/);
});

test('session-start injects fix-task content and rotates the file', () => {
  const repo = mkRepo();
  ft.write(repo, {
    verdict: 'quality_fail',
    counter: 1,
    failures: [{ stage: 'test', exitCode: 1, excerpt: 'failure-needle' }],
  });
  const r = runSessionStart(repo);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /\[mccp:fix-task — pending correction/);
  assert.match(r.stdout, /failure-needle/);
  const fixPath = path.join(repo, '.claude', 'state', 'fix-task.md');
  const appliedPath = path.join(repo, '.claude', 'state', 'fix-task-applied.md');
  assert.ok(!fs.existsSync(fixPath), 'fix-task.md should be rotated');
  assert.ok(fs.existsSync(appliedPath), 'fix-task-applied.md should exist');
});

test('session-start STATE comes BEFORE fix-task in additionalContext order', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'order1', goal: 'STATE-MARKER' });
  ft.write(repo, {
    verdict: 'quality_fail',
    counter: 1,
    failures: [{ stage: 'test', exitCode: 1, excerpt: 'FIXTASK-MARKER' }],
  });
  const r = runSessionStart(repo);
  assert.strictEqual(r.status, 0);
  const stateIdx = r.stdout.indexOf('STATE-MARKER');
  const fixIdx = r.stdout.indexOf('FIXTASK-MARKER');
  assert.ok(stateIdx >= 0 && fixIdx > stateIdx, 'STATE must precede fix-task (state=' + stateIdx + ', fix=' + fixIdx + ')');
});

test('session-start exits 0 even when STATE.md is corrupt (injector failure isolation)', () => {
  const repo = mkRepo();
  const stateDir = path.join(repo, '.claude', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'STATE.md'), 'totally broken\nnot frontmatter\n', 'utf8');
  const r = runSessionStart(repo);
  assert.strictEqual(r.status, 0, 'corrupt STATE.md must not abort session-start; stderr=' + r.stderr);
});

test('session-start does NOT rotate fix-task when truncation cuts mid-body (Codex stop-time finding: partial delivery)', () => {
  const repo = mkRepo();
  // Body large enough that the head marker fits inside MAX_CHARS but the
  // tail marker does not — simulating limitSessionStartContext slicing
  // through the middle of the fix-task body.
  const bigExcerpt = 'X'.repeat(2000);
  ft.write(repo, {
    verdict: 'quality_fail',
    counter: 1,
    failures: [{ stage: 'test', exitCode: 1, excerpt: bigExcerpt }],
  });
  const r = runSessionStart(repo, { ECC_SESSION_START_MAX_CHARS: '300' });
  assert.strictEqual(r.status, 0, 'session-start must still exit 0; stderr=' + r.stderr);
  // Head appears in stdout (it's near the top of the slice).
  assert.match(r.stdout, /\[mccp:fix-task — pending correction/);
  // Tail does NOT appear — the slice cut before reaching it.
  assert.ok(!r.stdout.includes('[mccp:fix-task — end of pending correction]'),
    'tail marker MUST be truncated away in this test setup');
  // The critical invariant: fix-task.md MUST still be on disk for redelivery.
  const fixPath = path.join(repo, '.claude', 'state', 'fix-task.md');
  const appliedPath = path.join(repo, '.claude', 'state', 'fix-task-applied.md');
  assert.ok(fs.existsSync(fixPath), 'fix-task.md MUST survive a mid-body truncation (no premature rotation)');
  assert.ok(!fs.existsSync(appliedPath), 'fix-task-applied.md MUST NOT be created when delivery was partial');
});

// TODO(s10a-followup): regression for shouldInjectContext=skip path. Env var
// discovery for CLAUDE_CODE_SESSION_START_* needed. Production fix already
// in session-start.js: fixTaskPushed only true when shouldInjectContext gate
// passes AND fixTaskSurvivedLimit checked before commit.
