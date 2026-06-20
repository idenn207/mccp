'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const hook = require('../stop-review-loop');
const lc = require('../../state/loop-counter');
const ft = require('../../state/fix-task');
const sw = require('../../state/state-writer');

function mkGitRepo({ withDiff = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-stop-loop-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# x\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init', '--quiet'], { cwd: dir, stdio: 'ignore' });
  if (withDiff) {
    fs.writeFileSync(path.join(dir, 'README.md'), '# x\nchanged\n', 'utf8');
  }
  return fs.realpathSync(dir);
}

function writeTranscript(repo, firstUserText) {
  const target = path.join(repo, 'transcript.jsonl');
  const line = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: firstUserText }] },
  });
  fs.writeFileSync(target, line + '\n', 'utf8');
  return target;
}

function captureStderr() {
  const lines = [];
  return {
    stderr: { write: function (s) { lines.push(String(s)); } },
    text: function () { return lines.join(''); },
  };
}

function passDetection() { return { packageManager: 'npm', stages: {} }; }
function passRunner() { return { passed: true, packageManager: 'npm', stages: [] }; }
function failRunner(stage) {
  return {
    passed: false,
    packageManager: 'npm',
    stages: [{
      name: stage || 'lint',
      status: 'fail',
      command: 'npm run ' + (stage || 'lint'),
      exitCode: 1,
      stdout: '',
      stderr: 'lint failed: error rule X',
      durationMs: 1,
    }],
  };
}

test('path 1: MCCP_STOP_LOOP=off → passes through, no fs writes', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task A') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'off' },
    stderr: capture.stderr,
    cwd: repo,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
  assert.ok(!fs.existsSync(ft.fixTaskPath(repo)));
});

test('path 2: enforce + no diff → passes through, no fix-task', () => {
  const repo = mkGitRepo({ withDiff: false });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task B') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => true,
  });
  assert.strictEqual(out, raw);
  assert.ok(!fs.existsSync(ft.fixTaskPath(repo)));
});

test('path 3: enforce + quality pass (codex opt-out) → passes, counter reset, STATE.md emits stop_loop_pass (v0.3.0 S10b)', () => {
  const repo = mkGitRepo({ withDiff: true });
  const fp = lc.fingerprintFromPrompt('task C');
  lc.bump(repo, fp, 'old');
  assert.strictEqual(lc.get(repo, fp).count, 1);
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task C') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
  assert.strictEqual(lc.get(repo, fp).count, 0, 'counter should be reset on pass');
  // v0.3.0 S10b: PASS path emits safe-event signal so auto-handoff's AND-gate sees it.
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.last_event, 'stop_loop_pass');
  assert.ok(state.frontmatter.last_event_at);
});

test('path 4: enforce + quality fail → block + fix-task + counter=1', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task D') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => failRunner('lint'),
    gitDiffEmpty: () => false,
  });
  const decoded = JSON.parse(out);
  assert.strictEqual(decoded.decision, 'block');
  assert.match(decoded.reason, /quality fail.*lint/);
  assert.ok(fs.existsSync(ft.fixTaskPath(repo)));
  const fp = lc.fingerprintFromPrompt('task D');
  assert.strictEqual(lc.get(repo, fp).count, 1);
});

test('path 5: enforce + STOP_LOOP_CODEX=1 + converged → passes', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task E') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce', MCCP_STOP_LOOP_CODEX: '1' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => false,
    codexResultText: 'Round 1: APPROVE\nConclusion: CONVERGED',
  });
  assert.strictEqual(out, raw);
});

test('path 6: enforce + counter at MAX → human takeover, allow', () => {
  const repo = mkGitRepo({ withDiff: true });
  const fp = lc.fingerprintFromPrompt('task F');
  lc.bump(repo, fp, 'a');
  lc.bump(repo, fp, 'b'); // count=2 (MAX)
  assert.strictEqual(lc.get(repo, fp).count, 2);
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task F') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => failRunner('lint'), // would fail, but counter blocks the check
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
  assert.match(capture.text(), /human takeover/);
  // counter unchanged
  assert.strictEqual(lc.get(repo, fp).count, 2);
});

test('path 7: enforce + STOP_LOOP_CODEX=1 + critical → block + escalate', () => {
  const prev = process.env.MCCP_CODEX_DISABLED;
  delete process.env.MCCP_CODEX_DISABLED;
  try {
    const repo = mkGitRepo({ withDiff: true });
    const capture = captureStderr();
    const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task G') });
    const out = hook.run(raw, {
      env: { MCCP_STOP_LOOP: 'enforce', MCCP_STOP_LOOP_CODEX: '1' },
      stderr: capture.stderr,
      repoRoot: repo,
      detection: passDetection(),
      runQuality: passRunner,
      gitDiffEmpty: () => false,
      codexResultText: 'Round 1: secret key committed — secret leaked',
    });
    const decoded = JSON.parse(out);
    assert.strictEqual(decoded.decision, 'block');
    assert.match(decoded.reason, /Codex CRITICAL/);
    const body = ft.read(repo);
    assert.ok(body);
    assert.match(body, /## Dual Reviewer Escalation Required/);
  } finally {
    if (prev === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prev;
  }
});

test('observe mode never blocks even when quality fails', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task H') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'observe' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => failRunner('lint'),
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw); // pass-through
  // fix-task still written, counter still bumped
  assert.ok(fs.existsSync(ft.fixTaskPath(repo)));
  const fp = lc.fingerprintFromPrompt('task H');
  assert.strictEqual(lc.get(repo, fp).count, 1);
});

test('default mode is observe (env unset)', () => {
  assert.strictEqual(hook.modeFromEnv({}), 'observe');
  assert.strictEqual(hook.modeFromEnv({ MCCP_STOP_LOOP: '' }), 'observe');
  assert.strictEqual(hook.modeFromEnv({ MCCP_STOP_LOOP: 'OFF' }), 'off');
  assert.strictEqual(hook.modeFromEnv({ MCCP_STOP_LOOP: 'unknown' }), 'observe');
});

test('fail-open: not-a-git-repo cwd allows pass-through', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-not-git-'));
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: tmp });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce' },
    stderr: capture.stderr,
    repoRoot: null, // explicit
    cwd: tmp,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
});

test('STOP_LOOP_CODEX=1 + unavailable verdict → allow (auto-fallback)', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task I') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce', MCCP_STOP_LOOP_CODEX: '1' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => false,
    codexResultText: 'error: setup_required',
  });
  assert.strictEqual(out, raw);
});

test('STOP_LOOP_CODEX=1 with no codex result file → allow (graceful)', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'task J') });
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce', MCCP_STOP_LOOP_CODEX: '1' },
    stderr: capture.stderr,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: passRunner,
    gitDiffEmpty: () => false,
    codexResultText: null, // file absent
  });
  assert.strictEqual(out, raw);
  assert.match(capture.text(), /no codex result file/);
});

test('concurrent failing Stop hooks keep fix-task.counter and loop-counter in lockstep (Reviewer B R2 #1)', () => {
  const repo = mkGitRepo({ withDiff: true });
  const fp = lc.fingerprintFromPrompt('concurrent-fail-task');

  // Sequential simulation of the lock contract: each call invokes the hook
  // logic exactly as a real Stop event would, and the counter under lock
  // must equal the counter written into fix-task.md after every call.
  for (let i = 1; i <= 2; i++) {
    const capture = captureStderr();
    const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'concurrent-fail-task') });
    const out = hook.run(raw, {
      env: { MCCP_STOP_LOOP: 'enforce' },
      stderr: capture.stderr,
      repoRoot: repo,
      detection: passDetection(),
      runQuality: () => failRunner('lint'),
      gitDiffEmpty: () => false,
    });
    const decoded = JSON.parse(out);
    assert.strictEqual(decoded.decision, 'block');
    const counterAfter = lc.get(repo, fp).count;
    const fixTaskBody = ft.read(repo);
    const counterInFixTask = parseInt((fixTaskBody.match(/^counter: (\d+)/m) || [])[1], 10);
    assert.strictEqual(counterInFixTask, counterAfter,
      'fix-task.counter (' + counterInFixTask + ') must equal loop-counter.count (' +
      counterAfter + ') after pass ' + i);
  }
  // Final state: counter must be at MAX_COUNT, fix-task agrees
  assert.strictEqual(lc.get(repo, fp).count, lc.MAX_COUNT);
  const finalBody = ft.read(repo);
  assert.match(finalBody, /^counter: 2$/m);
});

// ─── M3 axis C — goal-phase lock-aware short-circuit (Task 9) ───
// Validates Task 8 freshness-validated short-circuit (Codex impl-R1 F2 absorption).
// 4 scenarios per absorption: fresh=suppress, stale=fall-through,
// foreign-dead=fall-through, parse-error=fall-through (loud fail-open).

function writeGoalLock(repo, body, mtimePastMs) {
  const dir = path.join(repo, '.claude', 'state');
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'goal-phase.lock');
  fs.writeFileSync(lockPath, body, 'utf8');
  if (typeof mtimePastMs === 'number') {
    const past = new Date(Date.now() - mtimePastMs);
    fs.utimesSync(lockPath, past, past);
  }
  return lockPath;
}

test('M3-S1: goal-phase lock active (fresh, same-host live pid) → suppress + pass-through, no quality runner', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  writeGoalLock(repo, JSON.stringify({
    run_id: 'gp-1',
    ownership_token_hash: 'h'.repeat(64),
    host: os.hostname(),
    pid: process.pid,
    milestone_id: 'm3-test',
  }));
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'goal task A') });
  let qualityCalled = false;
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'enforce' },
    stderr: capture.stderr,
    cwd: repo,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => { qualityCalled = true; return passRunner(); },
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw, 'should pass-through rawInput on suppress');
  assert.match(capture.text(), /suppressed: goal-phase lock active/);
  assert.strictEqual(qualityCalled, false, 'quality runner must not fire under goal-phase lock');
  assert.ok(!fs.existsSync(ft.fixTaskPath(repo)), 'fix-task must not be written');
});

test('M3-S2: goal-phase lock stale (cross-host + age > lease) → fall-through to quality runner', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  writeGoalLock(repo, JSON.stringify({
    run_id: 'gp-2',
    ownership_token_hash: 'h'.repeat(64),
    host: 'someother-host',
    pid: 999999,
    milestone_id: 'm3-test',
  }), 180000); // 180s past — > 90s lease
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'goal task B') });
  let qualityCalled = false;
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'observe' },
    stderr: capture.stderr,
    cwd: repo,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => { qualityCalled = true; return passRunner(); },
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
  assert.match(capture.text(), /goal-lock found but stale or foreign-dead/);
  assert.strictEqual(qualityCalled, true, 'quality runner MUST fire when goal-lock is stale');
});

test('M3-S3: goal-phase lock same-host + dead-pid (foreign-dead) → fall-through to quality runner', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  writeGoalLock(repo, JSON.stringify({
    run_id: 'gp-3',
    ownership_token_hash: 'h'.repeat(64),
    host: os.hostname(),
    pid: 999999, // definitely-dead
    milestone_id: 'm3-test',
  }));
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'goal task C') });
  let qualityCalled = false;
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'observe' },
    stderr: capture.stderr,
    cwd: repo,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => { qualityCalled = true; return passRunner(); },
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
  assert.match(capture.text(), /goal-lock found but stale or foreign-dead/);
  assert.strictEqual(qualityCalled, true);
});

test('M3-S4: goal-phase lock parse error → loud fail-open (fall-through, stderr "check failed")', () => {
  const repo = mkGitRepo({ withDiff: true });
  const capture = captureStderr();
  writeGoalLock(repo, '{not-json');
  const raw = JSON.stringify({ cwd: repo, transcript_path: writeTranscript(repo, 'goal task D') });
  let qualityCalled = false;
  const out = hook.run(raw, {
    env: { MCCP_STOP_LOOP: 'observe' },
    stderr: capture.stderr,
    cwd: repo,
    repoRoot: repo,
    detection: passDetection(),
    runQuality: () => { qualityCalled = true; return passRunner(); },
    gitDiffEmpty: () => false,
  });
  assert.strictEqual(out, raw);
  assert.match(capture.text(), /goal-lock check failed/);
  assert.strictEqual(qualityCalled, true, 'parse error must not block normal Stop-loop path');
});
