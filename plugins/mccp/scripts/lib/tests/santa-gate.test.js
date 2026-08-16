'use strict';

// santa/gate — 동작 보존 (santa-loop-materialize M1 / Task 3).
//
// M1은 **판정 결과를 바꾸지 않는다**(UI10). 그래서 이 파일이 검증하는 것은
// 새 기능이 아니라 **현 `santa-loop.md` Step 4 산문과의 동치**다:
//
//   "Both PASS → NICE · Either FAIL → NAUGHTY"
//
// 4조합을 전수로 고정해 두면, P1이 severity 축을 넣다가 기존 매핑을 건드리는
// 순간 red가 된다. `gate.js`는 순수 함수라 CLI 레벨 단언이 필요 없다 —
// 배선 결함은 santa-loop-cap.test.js가 CLI 경유로 본다.

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../santa/gate');

function env(id, verdict, criticalIssues) {
  return { id: id, model: 'model-' + id, verdict: verdict, criticalIssues: criticalIssues || [] };
}

test('gate — PASS/PASS → NICE (산문 1행)', () => {
  const r = gate.decideVerdict({ reviewers: [env('A', 'PASS'), env('B', 'PASS')] });
  assert.equal(r.verdict, 'NICE');
  assert.deepEqual(r.failing, []);
});

test('gate — PASS/FAIL → NAUGHTY, failing은 FAIL한 id만', () => {
  const r = gate.decideVerdict({ reviewers: [env('A', 'PASS'), env('B', 'FAIL')] });
  assert.equal(r.verdict, 'NAUGHTY');
  assert.deepEqual(r.failing, ['B']);
});

test('gate — FAIL/PASS → NAUGHTY, failing은 FAIL한 id만', () => {
  const r = gate.decideVerdict({ reviewers: [env('A', 'FAIL'), env('B', 'PASS')] });
  assert.equal(r.verdict, 'NAUGHTY');
  assert.deepEqual(r.failing, ['A']);
});

test('gate — FAIL/FAIL → NAUGHTY, failing은 둘 다', () => {
  const r = gate.decideVerdict({ reviewers: [env('A', 'FAIL'), env('B', 'FAIL')] });
  assert.equal(r.verdict, 'NAUGHTY');
  assert.deepEqual(r.failing, ['A', 'B']);
});

// envelope 0건 → NAUGHTY는 **살아 있는 규칙**이다(DD12). 초안 DD12는 이 경로를
// CLI에서 막으려 했으나 봉인 패스 Codex F0이 그것을 UI10 위반(도달 가능하던
// 판정을 없앰)으로 지적해 되돌렸다. 여기서 고정해 두지 않으면 P1이 그 규칙을
// 조용히 되살릴 수 있다.
test('gate — envelope 0건 → NAUGHTY (fail-closed, 도달 가능한 규칙)', () => {
  const r = gate.decideVerdict({ reviewers: [] });
  assert.equal(r.verdict, 'NAUGHTY');
  assert.deepEqual(r.failing, []);
});

test('gate — reviewers 부재/비배열도 NAUGHTY (증거 없음은 통과가 아니다)', () => {
  assert.equal(gate.decideVerdict({}).verdict, 'NAUGHTY');
  assert.equal(gate.decideVerdict({ reviewers: null }).verdict, 'NAUGHTY');
  assert.equal(gate.decideVerdict().verdict, 'NAUGHTY');
});

// **이것은 미봉이 아니라 위임 대상 함수의 현행 동작이다** (santa-adjudication M1 /
// Task 5 · DD3). `{A,B}` 완전성은 M1이 닫았지만 그 규칙은 신규 export
// `decideAdjudicatedVerdict`에만 들어갔고, 동결 함수 `decideVerdict`는 한 글자도
// 바뀌지 않았다(ownership.md §변경 프로토콜 2). 두 함수를 하나로 읽으면 M1이 P0의
// 보존 계약을 깬 것처럼 보이는데, 깨지 않는 이유가 정확히 그 분리다.
//
// 그러므로 이 단언을 "이제 닫혔으니 뒤집자"고 고치지 마라 — 이 동작이 바뀌면
// `severityGate='off'`와 `contract='partial'` 경로가 **함께** 바뀐다(그 둘이 이
// 함수에 위임한다). `{A,B}` 완전성이 실제로 강제되는지는
// `santa-adjudication.test.js`의 커버리지 13·22가 잰다.
test('gate — 리뷰어 1명 PASS만으로 NICE (decideAdjudicatedVerdict의 위임 대상, 동결 동작)', () => {
  const r = gate.decideVerdict({ reviewers: [env('A', 'PASS')] });
  assert.equal(r.verdict, 'NICE',
    'M1은 {A,B} 완전성 검사를 갖지 않는다(UI11). P1이 이 규칙을 넣으면 이 단언을 함께 갱신하라.');
});

test('gate — round/cap은 받되 판정에 관여하지 않는다 (frozen-but-inert, 위임 대상)', () => {
  const base = { reviewers: [env('A', 'PASS'), env('B', 'PASS')] };
  const a = gate.decideVerdict(Object.assign({}, base, { round: 0, cap: 3 }));
  const b = gate.decideVerdict(Object.assign({}, base, { round: 99, cap: 1 }));
  assert.deepEqual(a, b);
  assert.equal(a.exitReason, null, 'P0는 종료 조건을 소유하지 않는다(UI1)');
});

test('gate — 순수 함수: 입력을 변형하지 않는다', () => {
  const reviewers = [env('A', 'PASS'), env('B', 'FAIL')];
  const snapshot = JSON.stringify(reviewers);
  gate.decideVerdict({ reviewers: reviewers });
  assert.equal(JSON.stringify(reviewers), snapshot);
});

// receipt 어휘가 M2 이전에 새는 것을 막는다(DD8). `gate.js`가 'converged' 같은
// 값을 반환하기 시작하면 UI6("review_source는 multi-agent 고정")의 경계가
// 흐려진다 — M1은 NICE/NAUGHTY 두 값만 안다.
test('gate — receipt 어휘가 새지 않는다: verdict는 NICE|NAUGHTY 뿐 (DD8)', () => {
  const combos = [['PASS', 'PASS'], ['PASS', 'FAIL'], ['FAIL', 'PASS'], ['FAIL', 'FAIL']];
  for (const [a, b] of combos) {
    const v = gate.decideVerdict({ reviewers: [env('A', a), env('B', b)] }).verdict;
    assert.ok(v === 'NICE' || v === 'NAUGHTY', 'unexpected verdict vocabulary: ' + v);
  }
});
