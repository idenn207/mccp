'use strict';

// review-record-linkage M1 — 순수 정의 회귀 test.
//
// 고정하는 것은 **술어와 분류 규칙**이다. 실코퍼스에 대한 경험적 주장(오늘 값이
// 0%라는 것 등)은 픽스처로 증명되지 않는다 — 그 반증은 도구를 실제 코퍼스에 돌린
// 출력을 문서에 축자 동결하는 것으로 성립한다(`linkage-frozen-baseline.test.js`).
//
// 특히 지키는 것:
//   - 복제 금지 — corpus.js 가 소유한 술어가 여기서 export되지 않는다 (DD1a)
//   - dep-free — require 0건 (DD1: M4 가 import해도 fs/child_process 전이 없음)
//   - 상수 스텁 통과 금지 — 부정 단언만 있으면 언제나 false 를 반환하는 구현이
//     전부 green 이 된다. 긍정 픽스처가 그 구멍을 닫는다.
//   - 총함수 + 벽시계 상한 — throw 없이 *멎는* 실패(ReDoS)는 throw 검사가 못 잡는다

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const defs = require('../plan-review/linkage-defs');

const DEFS_PATH = path.join(__dirname, '..', 'plan-review', 'linkage-defs.js');

// ── DD1 / DD1a — 모듈 경계 ───────────────────────────────────────────────────

test('linkage-defs is dep-free: zero require() calls', function () {
  const src = fs.readFileSync(DEFS_PATH, 'utf8');
  const hits = src.match(/require\s*\(/g) || [];
  assert.equal(hits.length, 0,
    'linkage-defs.js must stay dep-free so a write-path module can import it without ' +
    'pulling fs/child_process in transitively (DD1)');
});

test('DD1a — the corpus-owned predicate is NOT re-exported here', function () {
  // 이 단언이 막는 것: `corpus.js` 가 이미 소유한 패널 서명 판별을 여기 다시
  // 만드는 것. 주석에서 이름을 *언급*하는 것은 무해하므로 export 표면만 본다.
  assert.equal(typeof defs.isPanelRecord, 'undefined');
  assert.equal(typeof defs.PANEL_SIGNATURE_RE, 'undefined');
  Object.keys(defs).forEach(function (k) {
    const v = defs[k];
    if (v instanceof RegExp) {
      assert.ok(!v.test('# Plan Review Panel — x'),
        'exported regex ' + k + ' matches the panel signature — that predicate belongs to corpus.js');
    }
  });
});

// ── D1 — 라운드 구조 ─────────────────────────────────────────────────────────

test('hasRoundStructure accepts only an integer >= 1', function () {
  assert.equal(defs.hasRoundStructure({ rounds: 1 }), true);
  assert.equal(defs.hasRoundStructure({ rounds: 3 }), true);

  assert.equal(defs.hasRoundStructure({ rounds: 0 }), false);
  assert.equal(defs.hasRoundStructure({ rounds: -1 }), false);
  assert.equal(defs.hasRoundStructure({ rounds: 1.5 }), false);
  assert.equal(defs.hasRoundStructure({ rounds: '2' }), false, 'a string is not an integer');
  assert.equal(defs.hasRoundStructure({ rounds: null }), false);
  assert.equal(defs.hasRoundStructure({ rounds: undefined }), false);
  assert.equal(defs.hasRoundStructure({}), false, 'key absent is not structure');
  assert.equal(defs.hasRoundStructure(null), false);
  assert.equal(defs.hasRoundStructure(undefined), false);
  assert.equal(defs.hasRoundStructure([]), false);
  assert.equal(defs.hasRoundStructure('rounds: 3'), false);
});

test('the 5 controls are prose-token definitions and each reacts only to its own shape', function () {
  const byId = {};
  defs.ROUND_STRUCTURE_CONTROLS.forEach(function (c) { byId[c.id] = c; });
  assert.deepEqual(Object.keys(byId).sort(), ['A', 'B', 'C', 'D', 'E']);

  assert.equal(byId.A.test('#### Round 2\n'), true);
  assert.equal(byId.A.test('### Round 2\n'), false, 'depth-3 heading is not the A shape');
  assert.equal(byId.A.test('a #### Round 2'), false, 'A is anchored to line start');

  assert.equal(byId.B.test('absorbed in round 2'), true);
  assert.equal(byId.B.test('absorbed in R2'), false);

  assert.equal(byId.C.test('absorbed in R2'), true);
  assert.equal(byId.C.test('see R2D2'), false, 'word-bounded');
  assert.equal(byId.C.test('round 2'), false);

  assert.equal(byId.D.test('round 2'), true);
  assert.equal(byId.D.test('R1'), true);
  assert.equal(byId.D.test('no tokens here'), false);

  assert.equal(byId.E.test('the round was long'), true);
  assert.equal(byId.E.test('라운드가 길었다'), true);
  assert.equal(byId.E.test('no tokens here'), false);

  // 대조군은 measurement 가 아니라 원문을 본다 — 그것이 D1 과의 차이다.
  assert.equal(byId.B.test(''), false);
  defs.ROUND_STRUCTURE_CONTROLS.forEach(function (c) {
    assert.equal(c.test(null), false);
    assert.equal(c.test(undefined), false);
    assert.equal(c.test(12345), false);
  });
});

// ── D2 — 리뷰 대상 ship ─────────────────────────────────────────────────────

test('classifyShipEligibility: plan_hash alone never makes a ship eligible', function () {
  // 회귀 가드 — 실측이 배제한 판별자다(71/71 이 plan_hash 를 갖는다).
  const r = defs.classifyShipEligibility({
    plan_hash: 'sha256:deadbeef',
    meta: { command: '/mccp-pr-codex', created_at: '2026-01-01T00:00:00.000Z' },
  });
  assert.equal(r.verdict, 'undecidable');
  assert.match(r.reason, /plan_review_expected/);
});

test('classifyShipEligibility: an unexplained exclusion is not a decision', function () {
  const r = defs.classifyShipEligibility({ meta: { plan_review_expected: false } });
  assert.equal(r.verdict, 'undecidable', 'false without a reason must not shrink the denominator');
  const r2 = defs.classifyShipEligibility({
    meta: { plan_review_expected: false, no_plan_review_reason: '   ' },
  });
  assert.equal(r2.verdict, 'undecidable', 'a blank reason is no reason');
});

test('classifyShipEligibility POSITIVE: the explicit proof field decides both ways', function () {
  // 긍정 픽스처 — 이것이 없으면 언제나 undecidable 을 반환하는 스텁이 통과한다.
  const yes = defs.classifyShipEligibility({ meta: { plan_review_expected: true } });
  assert.equal(yes.verdict, 'eligible');

  const no = defs.classifyShipEligibility({
    meta: { plan_review_expected: false, no_plan_review_reason: 'archive chore — no plan gate ran' },
  });
  assert.equal(no.verdict, 'not_eligible');
  assert.match(no.reason, /archive chore/);
});

test('classifyShipEligibility is total', function () {
  [null, undefined, 42, 'x', [], {}, { meta: null }, { meta: [] }].forEach(function (input) {
    const r = defs.classifyShipEligibility(input);
    assert.equal(r.verdict, 'undecidable');
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0, 'undecidable always carries a reason');
  });
});

// ── D3 — 층간 링크 ──────────────────────────────────────────────────────────

const F = defs.LINKAGE_FIELD_NAMES;

test('classifyLink: prose mentioning receipt_hash is NOT a link (DD4 false-positive guard)', function () {
  // PRD 가 찾은 4건이 이 형태였다 — 리뷰어가 그 필드를 *주제로 논한* finding.
  const record = {
    text: 'the reviewer wrote: receipt_hash must never be recomputed (see receipt_hash invariant)',
    measurement: { verdict: 'divergent' },     // 구조적 위치에는 없다
  };
  const r = defs.classifyLink({ meta: {} }, record);
  assert.equal(r.review_to_receipt, false);
  assert.equal(r.bidirectional, false);
});

test('classifyLink: non-repo-relative path shapes are rejected', function () {
  ['/etc/passwd', 'C:\\Users\\x\\a.md', 'c:/x/a.md', '\\\\server\\share\\a.md',
    '../outside/a.md', '.claude/../../a.md', '', '   ', 'has space/a.md'].forEach(function (bad) {
    const r = defs.classifyLink({ meta: { [F.receiptToReview]: bad } }, null);
    assert.equal(r.receipt_to_review, false, 'must reject: ' + JSON.stringify(bad));
  });
  assert.equal(defs.isRepoRelativePath('a'.repeat(600)), false, 'length bounded');
});

test('classifyLink POSITIVE: both directions and bidirectional actually fire', function () {
  // 긍정 픽스처 — 부정 단언만 있으면 상수 false 스텁이 전부 통과한다.
  const receipt = { meta: { [F.receiptToReview]: '.claude/reviews/plan-review-x.md' } };
  const record = { measurement: { [F.reviewToReceipt]: 'sha256:abc123' } };

  const fwd = defs.classifyLink(receipt, null);
  assert.equal(fwd.receipt_to_review, true);
  assert.equal(fwd.bidirectional, false);

  const back = defs.classifyLink({ meta: {} }, record);
  assert.equal(back.review_to_receipt, true);
  assert.equal(back.bidirectional, false);

  const both = defs.classifyLink(receipt, record);
  assert.equal(both.receipt_to_review, true);
  assert.equal(both.review_to_receipt, true);
  assert.equal(both.bidirectional, true);
});

test('classifyLink is total', function () {
  [null, undefined, 42, 'x', [], {}].forEach(function (a) {
    [null, undefined, 42, 'x', [], {}].forEach(function (b) {
      const r = defs.classifyLink(a, b);
      assert.equal(typeof r.receipt_to_review, 'boolean');
      assert.equal(typeof r.review_to_receipt, 'boolean');
      assert.equal(typeof r.bidirectional, 'boolean');
    });
  });
});

// ── DD6 — 총함수 + 벽시계 상한 ──────────────────────────────────────────────

test('adversarial input never throws', function () {
  const inputs = [
    '', '\u0000\u0000\u0000', 'x'.repeat(200000), '{"truncated":',
    '# Plan Review Panel — x\n\n## Measurement\n\n```json\n{ not json\n```\n',
    '\r\n'.repeat(50000), '####'.repeat(20000),
  ];
  inputs.forEach(function (text) {
    defs.ROUND_STRUCTURE_CONTROLS.forEach(function (c) {
      assert.doesNotThrow(function () { c.test(text); });
    });
    assert.doesNotThrow(function () { defs.classifyShipEligibility({ meta: { note: text } }); });
    assert.doesNotThrow(function () { defs.classifyLink({ meta: { [F.receiptToReview]: text } }, { measurement: {} }); });
  });
});

test('pathological input stays within a wall-clock bound (ReDoS guard)', function () {
  // throw 없이 *멎는* 실패는 위 test 가 못 잡는다. 각 대조 정의가 모호 토큰을
  // 크게 반복한 입력에 대해 선형으로 끝나는지 시간으로 확인한다.
  const pathological = [
    'round '.repeat(60000),
    ('#### Round ' + 'a'.repeat(50) + '\n').repeat(4000),
    'R'.repeat(200000),
    ('라운드 ' + 'round ').repeat(40000),
  ];
  pathological.forEach(function (text) {
    defs.ROUND_STRUCTURE_CONTROLS.forEach(function (c) {
      const t0 = Date.now();
      c.test(text);
      const dt = Date.now() - t0;
      assert.ok(dt < 1000, 'control ' + c.id + ' took ' + dt + 'ms on a pathological input — ' +
        'suspect backtracking; the construction rules forbid nested quantifiers');
    });
  });
});
