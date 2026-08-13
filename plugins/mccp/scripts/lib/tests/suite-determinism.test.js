'use strict';

// gate-guard-integrity M2 축 A — `diffRuns` 부정 케이스.
//
// 1급 소재지가 스위트 안이라는 것이 이 파일의 존재 이유다. 부정 케이스를 bash
// 스니펫에만 두면 `node --test` 게이트 밖이라 "자동 탐지"가 "문서화된 의도"로
// 약해진다. 여기 있는 단언은 전수 실행 한 번이 강제한다.
//
// 입력은 **합성 TAP / 합성 실행 결과**다. 실제로 흔들리는 fixture 테스트를
// 스위트에 추가하지 않는다 — 그것은 신규 flake 유입이다.

const test = require('node:test');
const assert = require('node:assert');

const { diffRuns, parseTap } = require('../suite-determinism');

const sorted = (a) => a.slice().sort();

test('diffRuns: divergent failing sets are reported on all four fields', () => {
  const r = diffRuns([
    { pass: 10, fail: 1, failing: ['t-always'] },
    { pass: 9, fail: 2, failing: ['t-always', 't-x'] },
  ]);

  // 네 필드를 전부 단언한다. 두 개만 보면 나머지가 누락/오류여도 통과한다.
  assert.strictEqual(r.stable, false, 'a run-to-run difference must not read as stable');
  assert.deepStrictEqual(sorted(r.sometimesFailing), ['t-x'],
    'the name that failed in only one run is the divergence');
  assert.deepStrictEqual(sorted(r.alwaysFailing), ['t-always'],
    'a name failing in every run is deterministic red, not divergence');
  assert.deepStrictEqual(sorted(r.unionFailing), ['t-always', 't-x']);
});

test('diffRuns: identical runs are stable and carry no sometimes-failing', () => {
  const one = { pass: 3861, fail: 2, failing: ['a', 'b'] };
  const r = diffRuns([one, Object.assign({}, one), Object.assign({}, one)]);
  assert.strictEqual(r.stable, true);
  assert.deepStrictEqual(r.sometimesFailing, []);
  assert.deepStrictEqual(sorted(r.alwaysFailing), ['a', 'b']);
});

test('diffRuns: a pass/fail count that moves is divergence even when names match', () => {
  // 조건부 skip이 pass 와 skip 사이를 오가면 실패 **이름** 집합에는 흔적이
  // 남지 않는다. 이름만 대조하는 구현은 이 형태를 통과시킨다.
  const r = diffRuns([
    { pass: 100, fail: 1, failing: ['t'] },
    { pass: 99, fail: 1, failing: ['t'] },
  ]);
  assert.strictEqual(r.stable, false, 'counts moved — the suite did not give the same answer twice');
  assert.deepStrictEqual(r.sometimesFailing, [], 'and the divergence is NOT in the failing-name set');
});

test('diffRuns: a single run cannot establish stability (fail-closed)', () => {
  // "한 번 봤는데 안 갈라졌다"는 안정성의 근거가 아니다.
  const r = diffRuns([{ pass: 10, fail: 0, failing: [] }]);
  assert.strictEqual(r.stable, false);
  assert.match(r.reason, /insufficient-runs/);
});

test('diffRuns: no runs / malformed runs are fail-closed, not "clean"', () => {
  assert.strictEqual(diffRuns([]).stable, false);
  assert.strictEqual(diffRuns(null).stable, false);
  const bad = diffRuns([{ pass: 1, fail: 0, failing: ['x'] }, { pass: 1, fail: 0 }]);
  assert.strictEqual(bad.stable, false, 'a run with no failing[] must not read as "nothing failed"');
  assert.match(bad.reason, /malformed-run-at-index-1/);
});

test('parseTap: summary integers and top-level failing names', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: outer',
    '    not ok 1 - inner subtest',   // 들여쓰기된 subtest 는 세지 않는다
    'not ok 1 - static lint passes on the real repo (approved writers only)',
    'not ok 2 - some test # TODO not yet',
    'ok 3 - fine',
    '# tests 3869',
    '# pass 3861',
    '# fail 2',
    '# skipped 6',
  ].join('\n');
  const p = parseTap(tap);
  assert.strictEqual(p.tests, 3869);
  assert.strictEqual(p.pass, 3861);
  assert.strictEqual(p.fail, 2);
  assert.strictEqual(p.skipped, 6);
  assert.deepStrictEqual(p.failing, [
    'static lint passes on the real repo (approved writers only)',
    'some test',                       // 디렉티브는 이름에서 떼어낸다
  ]);
});

test('parseTap: a non-integer summary header is not adopted as a count', () => {
  // `# pass abc` 는 헤더 존재 검사를 통과하지만 델타 계산의 피감수로 쓸 수 없다.
  const p = parseTap('# pass abc\n# fail 2\n');
  assert.strictEqual(p.pass, null, 'a non-integer count must stay null, not NaN or 0');
  assert.strictEqual(p.fail, 2);
});
