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

// gate-guard-integrity M2 Task 2c — spawn 대상 스크립트 경로를 주입받는다.
// env 미설정 시 동작은 현행과 완전히 동일하므로 기존 케이스는 무영향이다. 이
// 통로가 있어야 §Validation 이 `git show HEAD:…/session-start.js` 로 **수정 전**
// 코드를 꺼내 같은 test 를 그것에 대고 돌릴 수 있고, 그때 반드시 FAIL 해야 한다 —
// 이름만 맞춘 빈 stub 을 거르는 유일한 기계적 수단이다.
const SESSION_START = process.env.MCCP_TEST_SESSION_START_PATH
  || path.resolve(__dirname, '..', 'session-start.js');

const FAIL_OPEN_MARKER = 'FAIL-OPEN-FORCED';

function mkRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-t-session-bootstrap-'));
  execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

// 진단 강화(Task 2c-B 착수 조건): 관측된 divergence 는 `stderr=` 만 찍었고 그
// 문자열이 비어 있어 원인 추적이 막혔다. signal · error · 종료 코드 출처를 함께
// 싣는다.
function diag(r) {
  return ' [status=' + r.status
    + ' signal=' + r.signal
    + ' error=' + (r.error ? r.error.code + '/' + r.error.message : 'none')
    + ' failOpenForced=' + (r.failOpenForced || 'none')
    + ' stderr=' + String(r.stderr || '').slice(0, 400) + ']';
}

function runSessionStart(repo, envOverrides, nodeArgs) {
  const r = spawnSync(process.execPath, (nodeArgs || []).concat([SESSION_START]), {
    cwd: repo,
    input: '{"session_id":"test"}',
    encoding: 'utf8',
    timeout: 15000,
    env: Object.assign({}, process.env, envOverrides || {}),
  });
  // 강제가 발동한 실행은 종료 코드로는 정상과 구별되지 않는다. marker 를 결과
  // 객체에 실어 두 신호를 분리한다 — 정상 경로 test 들이 부재를 단언할 수 있게.
  const m = /FAIL-OPEN-FORCED[^\n]*/.exec(String(r.stderr || ''));
  r.failOpenForced = m ? m[0] : null;
  return r;
}

// 정상 경로의 공통 단언: exit 0 이면서 **강제가 발동하지 않았어야** 한다. exit 0
// 만 보면 조용한 강제(이 PRD Risk 1 이 금지한 형태)와 진짜 정상이 구별되지 않고,
// 포착된 flake 도 harness 의 sometimesFailing 에서 사라진다.
function assertCleanExit(r, what) {
  assert.strictEqual(r.status, 0, what + diag(r));
  assert.strictEqual(r.failOpenForced, null,
    'the fail-open force must NOT fire on a healthy run' + diag(r));
}

test('session-start exits 0 when STATE.md and fix-task are both missing', () => {
  const repo = mkRepo();
  const r = runSessionStart(repo);
  assertCleanExit(r, 'exit non-zero');
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
  assertCleanExit(r, 'exit non-zero');
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
  assertCleanExit(r, 'exit non-zero');
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
  assertCleanExit(r, 'exit non-zero');
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
  assertCleanExit(r, 'corrupt STATE.md must not abort session-start');
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
  const r = runSessionStart(repo, { MCCP_SESSION_START_MAX_CHARS: '300' });
  assertCleanExit(r, 'session-start must still exit 0');
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

// ── gate-guard-integrity M2 Task 2c-A — fail-open contract ───────────────────
//
// 관측된 divergence 는 이 프로세스가 **exit 1 + stderr 완전 공백**으로 죽은 것이었다.
// `main().catch` 가 구조적으로 못 잡는 축은 정확히 하나 — module-scope throw — 이고,
// 아래 두 test 가 그 축을 계약으로 고정한다. 원인이 확정되지 않아도 성립한다:
// fail-open 은 "어떤 경로로든 exit 0" 이라는 전칭 명제이기 때문이다.

test('session-start exits 0 with a loud message when a module-scope require is broken (fail-open contract)', () => {
  const repo = mkRepo();
  // 트리를 복제하지 않고 module 해석만 가로챈다 — 실제 스크립트를, 실제 배치에서,
  // 의존성 하나만 깨진 채로 돌린다. 수정 전 코드에서는 이 throw 가 module-scope 를
  // 빠져나가 프로세스를 exit 1 로 죽인다(그것이 이 test 의 A/B 대상이다).
  const preload = path.join(repo, 'break-one-module.cjs');
  fs.writeFileSync(preload, [
    "const Module = require('module');",
    "const orig = Module._load;",
    "Module._load = function (request) {",
    "  if (request === '../lib/utils') {",
    "    const e = new Error('simulated broken module-scope require');",
    "    e.code = 'MODULE_NOT_FOUND';",
    "    throw e;",
    "  }",
    "  return orig.apply(this, arguments);",
    "};",
  ].join('\n'), 'utf8');

  const r = runSessionStart(repo, {}, ['--require', preload]);

  assert.strictEqual(r.status, 0,
    'a broken module-scope require must NOT block session startup' + diag(r));
  assert.ok(r.failOpenForced && r.failOpenForced.indexOf(FAIL_OPEN_MARKER) !== -1,
    'the force must be LOUD — a silent exit-0 is the failure mode this milestone exists to close'
    + diag(r));
  assert.match(r.failOpenForced, /origin=(module-require|uncaughtException|exit)/,
    'the marker must name where the force fired' + diag(r));
});

test('session-start.js declares exactly one exit-code assignment (fail-open contract has no legitimate non-zero path)', () => {
  // `process.on('exit')` 의 0 강제가 삼킬 수 있는 "정당한 실패 신호"가 이 hook 에
  // 존재하지 않는다는 사실을 고정한다. 미래에 누가 비영점 exit 을 도입하면 이
  // 단언이 먼저 깨져 사람이 판단하게 된다.
  const raw = fs.readFileSync(SESSION_START, 'utf8');
  const code = raw.split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

  const setters = [];
  const setRe = /process\.exitCode\s*=\s*([^;\n]+)/g;
  let m;
  while ((m = setRe.exec(code)) !== null) setters.push(m[1].trim());

  const exits = [];
  const exitRe = /process\.exit\s*\(([^)]*)\)/g;
  while ((m = exitRe.exec(code)) !== null) exits.push(m[1].trim());

  assert.ok(setters.length >= 1, 'the fail-open contract must assign an exit code at least once');
  for (const v of setters) {
    assert.strictEqual(v, '0',
      'session-start must never set a NON-ZERO exit code; found "' + v + '"');
  }
  for (const v of exits) {
    assert.ok(v === '' || v === '0',
      'session-start must never call process.exit() with a non-zero code; found "' + v + '"');
  }

  // "비영점 경로가 없다" 는 **볼 수 있는 코드**에 대해서만 참이다. module-scope
  // throw 는 그 코드를 한 줄도 지나지 않고 프로세스를 1 로 죽인다. 그래서 최종
  // 강제가 실재하는지까지 같은 test 가 요구한다 — 이것이 없으면 위 단언들은
  // 수정 전 코드에서도 통과하는 stub 이 된다.
  assert.ok(code.indexOf(FAIL_OPEN_MARKER) !== -1,
    'session-start must emit the ' + FAIL_OPEN_MARKER + ' marker when it forces fail-open');
  assert.match(code, /process\.on\(\s*['"]exit['"]/,
    'the terminal exit guard must exist — main().catch cannot reach a module-scope throw');
});

// TODO(s10a-followup): regression for shouldInjectContext=skip path. Env var
// discovery for CLAUDE_CODE_SESSION_START_* needed. Production fix already
// in session-start.js: fixTaskPushed only true when shouldInjectContext gate
// passes AND fixTaskSurvivedLimit checked before commit.
