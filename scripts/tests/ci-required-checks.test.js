'use strict';

// required check drift 진단의 파서와 판정 순수층 (M3 Task 8 · DD6).
//
// **판정 순수층만 단언하면 부족하다.** 앞 라운드의 셋은 전부 `diffChecks`라 실제
// producer(workflow의 job 이름 파서)가 무엇을 내는지 재는 단언이 0건이었고,
// Acceptance 4는 workflow를 제대로 읽지 못하는 구현으로도 만족됐다 — 이 계획이
// gate·Task 4에서 "순수층만 단언하면 부르는 한 줄이 빠진다"며 seam을 명시한 규율이
// 이 Task에만 빠져 있었다(L2 R21 test). 그래서 파서 2분기는 **실재 파일**에 대해 돈다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const GATE_WF = path.join(REPO, '.github', 'workflows', 'test-suite.yml');
const BASELINE_WF = path.join(REPO, '.github', 'workflows', 'test-suite-baseline.yml');

const { parseJobNames, diffChecks } = require('../ci-required-checks.js');

// ─────────────────────────────────────────────────────────────────────────────
// 판정 순수층 — 3분기
// ─────────────────────────────────────────────────────────────────────────────

test('diffChecks: declared and required agreeing is ok', () => {
  const v = diffChecks({ declared: ['full test suite gate'], required: ['full test suite gate'] });
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.missing, []);
  assert.deepStrictEqual(v.extra, []);
});

test('diffChecks: a declared name that is not required is drift', () => {
  // job 이름을 바꾸면 보호가 **조용히 풀린다**. 그것이 이 진단의 존재 이유다.
  const v = diffChecks({ declared: ['full test suite gate'], required: ['old gate name'] });
  assert.strictEqual(v.ok, false);
  assert.deepStrictEqual(v.missing, ['full test suite gate']);
  assert.deepStrictEqual(v.extra, ['old gate name']);
  assert.ok(v.reasons.includes('declared_not_required'));
  assert.ok(v.reasons.includes('required_not_declared'));
});

test('diffChecks: an absent protection list is NOT a pass', () => {
  // 보호 미설정을 "일치"로 접으면 진단이 아무것도 말하지 않는다. 그것은 축 C가
  // 절반이라는 뜻이고, 문서가 그것을 절반이라 적어야 한다(Acceptance 4).
  const v = diffChecks({ declared: ['full test suite gate'], required: null });
  assert.strictEqual(v.ok, false);
  assert.deepStrictEqual(v.reasons, ['protection_absent']);
});

// ─────────────────────────────────────────────────────────────────────────────
// 파서 2분기 — **실재 파일**에 대해 돈다
// ─────────────────────────────────────────────────────────────────────────────

test('parser: the enforcement workflow yields its literal job name', () => {
  // 강제 workflow의 job 이름을 **안정 리터럴**로 고정한 Task 5의 요구가 이 계약의 짝이다.
  const parsed = parseJobNames(fs.readFileSync(GATE_WF, 'utf8'));
  assert.deepStrictEqual(parsed.resolved, ['full test suite gate']);
  assert.deepStrictEqual(parsed.unresolved, []);
});

test('parser: a matrix-template job name is reported as unresolved, never as a check name', () => {
  // 템플릿 문자열을 그대로 check 이름으로 내면 **어떤 실제 체크와도 영원히 일치하지
  // 않아** drift를 상시 보고한다. 이 milestone 자신이 같은 사이클에서 baseline의 job
  // name을 matrix 템플릿으로 만들므로 이 분기는 가설이 아니다.
  const parsed = parseJobNames(fs.readFileSync(BASELINE_WF, 'utf8'));
  assert.deepStrictEqual(parsed.resolved, [], 'a templated name must not be emitted as a check name');
  assert.strictEqual(parsed.unresolved.length, 1);
  assert.ok(parsed.unresolved[0].indexOf('${{') >= 0);
});

test('parser: step-level and commented name: lines are not mistaken for job names', () => {
  // 주석 안의 `name:`이 check 이름으로 잡히면 이 진단이 산문을 검사하게 된다
  // (§3.17 선례). step의 `name:`은 job보다 깊으므로 들여쓰기로 갈린다.
  const yaml = [
    'jobs:',
    '  gate:',
    '    # name: a commented job name that must be ignored',
    '    name: real job name',
    '    steps:',
    '      - name: a step name that is not a check name',
    '        run: echo hi',
    '',
  ].join('\n');
  const parsed = parseJobNames(yaml);
  assert.deepStrictEqual(parsed.resolved, ['real job name']);
});

test('parser: quoted job names are unquoted', () => {
  const parsed = parseJobNames('jobs:\n  gate:\n    name: "quoted gate"\n    runs-on: x\n');
  assert.deepStrictEqual(parsed.resolved, ['quoted gate']);
});
