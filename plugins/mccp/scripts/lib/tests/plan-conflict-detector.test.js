'use strict';

// v0.4.0 axis H — plan-conflict-detector unit tests.
//
// Five scenarios required by plan §"plan-conflict-detector.test.js":
//   1. true positive  — signature drift (TypeError in unplanned file)
//   2. true negative  — style-only failure (lint in planned file)
//   3. edge           — empty plan returns no-conflict (conservative)
//   4. true positive  — file expansion (≥2 unplanned files in diff)
//   5. true positive  — fake validation pass (exit 0 but "0 tests run")

const test = require('node:test');
const assert = require('node:assert/strict');

const det = require('../plan-conflict-detector');
const fs = require('fs');
const path = require('path');

const SAMPLE_PLAN = [
  '# Plan: sample',
  '',
  '## Files to Change',
  '',
  '| File | Action | Why |',
  '|---|---|---|',
  '| [utils.js](../../utils.js) | UPDATE | refactor |',
  '| [tests/utils.test.js](../../tests/utils.test.js) | CREATE | coverage |',
  '',
  '## Tasks',
  '',
  '- Task 1',
  ''
].join('\n');

test('Scenario 1 — true positive: signature drift in file outside plan', () => {
  const failureOutput = [
    'TypeError: helpers.parse is not a function',
    '    at run (helpers.js:12:5)',
    '    at Object.<anonymous> (tests/runner.js:42:10)',
  ].join('\n');
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: failureOutput,
    filesChanged: [],
  });
  assert.equal(result.conflict, true, JSON.stringify(result));
  assert.equal(result.signal, 'signature-drift');
  assert.match(result.reason, /helpers\.js/);
});

test('Scenario 2 — true negative: lint failure on planned file', () => {
  const failureOutput = [
    'utils.js:10:1 — Missing semicolon (semi)',
    'utils.js:15:5 — Unexpected console statement (no-console)',
    '2 errors',
  ].join('\n');
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: failureOutput,
    filesChanged: ['utils.js'],
  });
  assert.equal(result.conflict, false, JSON.stringify(result));
  assert.equal(result.signal, null);
});

test('Scenario 3 — edge: empty plan returns no-conflict (conservative)', () => {
  const result = det.detectFromValidationFailure({
    planText: '',
    failureOutput: 'TypeError: x is not a function\n  at foo (bar.js:1:1)',
    filesChanged: ['bar.js'],
  });
  assert.equal(result.conflict, false, JSON.stringify(result));
  assert.equal(result.signal, null);
});

test('Scenario 4 — true positive: file expansion ≥2 unplanned files', () => {
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: '',
    filesChanged: [
      'utils.js',
      'tests/utils.test.js',
      'src/newComponent.js',
      'src/anotherNew.js',
      'src/yetAnother.js',
    ],
  });
  assert.equal(result.conflict, true, JSON.stringify(result));
  assert.equal(result.signal, 'file-expansion');
  assert.match(result.reason, /unplanned/);
});

test('Scenario 5 — true positive: fake validation pass ("0 tests run")', () => {
  const result = det.detectFromValidationFailure({
    planText: SAMPLE_PLAN,
    failureOutput: 'PASS plugins/mccp/tests/lib/foo.test.js\n  ✓ ok\n0 tests run\n',
    filesChanged: [],
  });
  assert.equal(result.conflict, true, JSON.stringify(result));
  assert.equal(result.signal, 'fake-pass');
  assert.match(result.reason, /fake-pass/);
});

// — extra coverage on parsing helpers (cheap; guards future regressions) —

test('parseFilesToChange extracts paths from markdown link cells', () => {
  const files = det.parseFilesToChange(SAMPLE_PLAN);
  assert.deepEqual(files, ['utils.js', 'tests/utils.test.js']);
});

test('parseFilesToChange handles literal (non-link) paths', () => {
  const planLiteral = [
    '## Files to Change',
    '',
    '| File | Action |',
    '|---|---|',
    '| src/raw.js | CREATE |',
    '',
  ].join('\n');
  const files = det.parseFilesToChange(planLiteral);
  assert.deepEqual(files, ['src/raw.js']);
});

test('detectFromFileExpansion returns no-conflict with empty plan files', () => {
  const r = det.detectFromFileExpansion({
    planFilesToChange: [],
    actualFilesChanged: ['a.js', 'b.js'],
  });
  assert.equal(r.conflict, false);
});

test('isInPlan does tail-match for relative path variants', () => {
  assert.equal(det.isInPlan('plugins/foo/utils.js', ['utils.js']), true);
  assert.equal(det.isInPlan('utils.js', ['plugins/foo/utils.js']), true);
  assert.equal(det.isInPlan('utils.js', ['otherUtils.js']), false);
});

test('fake-pass pattern does not match a clean passing output', () => {
  const clean = 'PASS plugins/mccp/tests\n  ✓ test 1\n  ✓ test 2\n2 tests passing\n';
  assert.equal(det.matchesFakePass(clean), null);
});

// -- santa-delta-review M3 Task 5 (DD7) -- 두 결함의 양끝 --------------------
//
// 불변식 2건을 **서로 다른 두 test**로 나눈다. 하나가 빠져도 다른 하나가 통과해 버리는
// 일이 없어야 하기 때문이다(DD7). acceptance는 그 위에 독립 `grep`을 한 번 더 둔다.

const NL = String.fromCharCode(10);

test('M3 불변식 1 — 백틱으로 감싼 plan 경로가 맨몸 diff 경로와 매칭된다', () => {
  const plan = [
    '# Plan: backticked',
    '',
    '## Files to Change',
    '',
    '| File | Action | Why |',
    '|---|---|---|',
    '| `plugins/mccp/scripts/lib/hook-trace.js` | UPDATE | shared root |',
    '| `plugins/mccp/scripts/derive/sources/backlog.js` | UPDATE | parser |',
    '',
  ].join(NL);

  const planned = det.parseFilesToChange(plan);
  // 파싱 단계에서 이미 백틱이 벗겨져야 한다 — 그렇지 않으면 매칭은 tail-match 우연에
  // 기대게 된다.
  assert.deepEqual(planned, [
    'plugins/mccp/scripts/lib/hook-trace.js',
    'plugins/mccp/scripts/derive/sources/backlog.js',
  ]);

  // diff 경로는 맨몸이다. 백틱 제거 이전에는 이 두 단언이 전부 false였다.
  assert.equal(det.isInPlan('plugins/mccp/scripts/lib/hook-trace.js', planned), true);
  assert.equal(det.isInPlan('plugins/mccp/scripts/derive/sources/backlog.js', planned), true);
  assert.equal(det.isInPlan('plugins/mccp/scripts/lib/santa/scope-delta.js', planned), false);

  // 반대 방향도 성립한다 — 표가 맨몸 경로를 쓰고 호출자가 백틱을 넘겨도 매칭된다.
  assert.equal(det.isInPlan('`plugins/mccp/scripts/lib/hook-trace.js`', planned), true);
});

test('M3 불변식 1b — 백틱 경로만 든 plan에서 변경 파일 전부가 unplanned로 보고되지 않는다', () => {
  const plan = [
    '## Files to Change',
    '',
    '| File | Action | Why |',
    '|---|---|---|',
    '| `a/b.js` | UPDATE | x |',
    '| `c/d.js` | UPDATE | y |',
    '',
  ].join(NL);
  const res = det.detectFromFileExpansion({
    planText: plan,
    filesChanged: ['a/b.js', 'c/d.js'],
  });
  // 백틱 미제거 시절 이 호출은 2건 unplanned로 conflict를 냈다 — 항상 발화하는 가드다.
  assert.equal(res.conflict, false, JSON.stringify(res));
});

test('M3 불변식 2 — 명령 본문에 두 점 diff가 0건이다 (정적 단언)', () => {
  // 이 저장소는 test가 `commands/*.md` 본문을 단언하는 패턴을 이미 세 파일에서 쓴다
  // (santa-delta-command-body.test.js:19-20 외). 여기서는 회귀 방지가 목적이고,
  // acceptance는 같은 불변식을 독립 `grep`으로 한 번 더 판정한다.
  //
  // 문자 클래스가 `[^ .]`인 것이 요점이다. `[^ ]`로 쓰면 `..` 앞의 점까지 삼켜
  // **세 점 표기도 매칭**하므로 판정이 고쳐도 0이 되지 않는다(M3 구현 시점 실측 —
  // plan의 acceptance 명령이 쓴 `[^ ]+`가 정확히 그 형태였다).
  const TWO_DOT = new RegExp(
    'git diff --name-only origin/[^ .]+[.][.][^.]', 'g');
  const body = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'commands', 'prp-implement.md'), 'utf8');

  assert.deepEqual(body.match(TWO_DOT) || [], [],
    'prp-implement.md must not carry a two-dot origin diff');

  // 판정 자체가 살아 있음을 같은 자리에서 증명한다 — 정규식이 아무것도 못 잡는
  // 상태로 조용히 굳는 것을 막는다.
  assert.equal(('x git diff --name-only origin/main..HEAD y'.match(TWO_DOT) || []).length, 1);
  assert.equal(('x git diff --name-only origin/main...HEAD y'.match(TWO_DOT) || []).length, 0);

  // 세 점 호출이 실제로 존재한다 — 「두 점 0건」이 「호출 자체가 사라졌다」로 충족되지
  // 않게 한다.
  assert.ok(
    body.indexOf('--files-changed "$(git diff --name-only origin/main...HEAD)"') !== -1,
    'the three-dot plan-conflict call must still be present');
});
