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

// ── M4 — D1 자격 3값 (DD5) ───────────────────────────────────────────────────
//
// 여기서 지키는 것은 두 축이다.
//   1. 3값이 실제로 갈린다 (상수 스텁이 전부 green 이 되지 않게 긍정·부정 모두)
//   2. **자기신고 면제가 닫혔다** — `halt_stage` 를 임의 문자열로 바꿔도 verdict 가
//      불변이다. 초판은 `halt_stage ∈ PRE_DISPATCH_HALT_STAGES` 를 면제 근거로 뒀는데
//      그 값은 `--halt-stage` 로 들어오는 caller 자유 문자열이라, DD4 가 유일한 강제
//      지점으로 지목한 감사 종료코드를 문자열 하나로 빠져나갈 수 있었다.

test('M4 — classifyRoundStructure is 3-valued and each branch is reachable', function () {
  const c = defs.classifyRoundStructure;

  assert.equal(c({ rounds: 1 }).verdict, 'present');
  assert.equal(c({ rounds: 7 }).verdict, 'present');

  // 키 부재 = M4 이전 코퍼스. 자격이 아니라 축 자체가 없다.
  assert.equal(c({}).verdict, 'absent');
  assert.equal(c({ verdict: 'converged' }).verdict, 'absent');

  // null + 패널 증거 없음 = dispatch 이전 halt. 라운드가 실제로 0회다.
  assert.equal(c({ rounds: null, quorum: null }).verdict, 'not_enrolled');
  assert.equal(c({ rounds: null, quorum: { responded: 0 } }).verdict, 'not_enrolled');

  // null + 패널 증거 있음 = 리뷰는 돌았는데 몇 라운드였는지 말하지 못한다 → 결손.
  assert.equal(c({ rounds: null, quorum: { responded: 4 } }).verdict, 'absent');
  // responded 가 null 인 것은 "비었다"가 아니라 "읽지 못했다" → 면제하지 않는다.
  assert.equal(c({ rounds: null, quorum: { responded: null } }).verdict, 'absent');

  // 0 은 면제가 아니다 — 원장이 있었고 아무것도 세지 않았다는 측정값이다.
  assert.equal(c({ rounds: 0, quorum: null }).verdict, 'absent');

  // 정수가 아닌 것은 전부 absent.
  assert.equal(c({ rounds: '3' }).verdict, 'absent');
  assert.equal(c({ rounds: 1.5 }).verdict, 'absent');
  assert.equal(c({ rounds: -1 }).verdict, 'absent');

  // 부정 판정에는 사유가 붙는다 (classifyShipEligibility 와 같은 계약).
  [{}, { rounds: null, quorum: { responded: 2 } }, { rounds: 0 }].forEach(function (m) {
    const r = c(m);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0, 'a negative verdict must carry its reason');
  });

  // verdict 는 선언된 열거 안에 있다.
  [{}, { rounds: 1 }, { rounds: null, quorum: null }, null, 42, []].forEach(function (m) {
    assert.ok(defs.ROUND_STRUCTURE_VERDICTS.indexOf(c(m).verdict) !== -1);
  });
});

test('M4 — halt_stage cannot move the verdict (the self-report exemption is closed)', function () {
  const c = defs.classifyRoundStructure;
  const stages = [
    null, '', '5.2b', '5.2a-0', '5.2e', 'pre-dispatch', 'PRE_DISPATCH',
    'anything the author feels like typing', '../../etc/passwd', '5.2h',
  ];
  // 자격을 얻는 경우와 못 얻는 경우 **양쪽** 모두에서 불변이어야 한다. 한쪽만 걸면
  // "면제를 켜는" 방향이나 "면제를 끄는" 방향 중 하나가 열린 채로 남는다.
  const bases = [
    { m: { rounds: null, quorum: null }, want: 'not_enrolled' },
    { m: { rounds: null, quorum: { responded: 3 } }, want: 'absent' },
    { m: { rounds: 2, quorum: { responded: 3 } }, want: 'present' },
    { m: { quorum: null }, want: 'absent' },
  ];
  bases.forEach(function (b) {
    stages.forEach(function (st) {
      const m = Object.assign({}, b.m, { halt_stage: st });
      assert.equal(c(m).verdict, b.want,
        'halt_stage=' + JSON.stringify(st) + ' must not change the verdict for ' +
        JSON.stringify(b.m));
    });
  });
  // 그리고 소스가 그 필드를 아예 읽지 않는다 — 위 단언은 행동이고 이것은 구조다.
  const src = fs.readFileSync(DEFS_PATH, 'utf8');
  const body = src.slice(src.indexOf('function classifyRoundStructure'),
    src.indexOf('// ── D2 — 리뷰 대상 ship'));
  assert.ok(body.indexOf('halt_stage') === -1,
    'classifyRoundStructure must not reference halt_stage at all (a caller-controlled ' +
    'free string cannot be the basis of an exemption)');
  assert.equal(typeof defs.PRE_DISPATCH_HALT_STAGES, 'undefined',
    'the discarded exemption list must not exist');
});

test('M4 — the frozen D1 predicate is byte-for-byte the M1 one', function () {
  // `classifyRoundStructure` 는 자격을 바꾸지 정의를 바꾸지 않는다(UI2). 이 단언이
  // 붉어지면 M4 가 M1 의 동결 baseline 을 움직였다는 뜻이다.
  const h = defs.hasRoundStructure;
  assert.equal(h({ rounds: 1 }), true);
  assert.equal(h({ rounds: 0 }), false);
  assert.equal(h({ rounds: null }), false);
  assert.equal(h({}), false);
  assert.equal(h({ rounds: '1' }), false);
  assert.equal(h({ rounds: 1.5 }), false);
  assert.equal(h(null), false);
  assert.equal(h([]), false);
  assert.equal(h('rounds: 3'), false);

  const src = fs.readFileSync(DEFS_PATH, 'utf8');
  const fn = src.slice(src.indexOf('function hasRoundStructure'),
    src.indexOf('// 대조군. 정의 선택의 반증 자료이므로'));
  assert.equal(fn.replace(/\s+/g, ' ').trim(),
    'function hasRoundStructure(measurement) { ' +
    'if (measurement === null || typeof measurement !== \'object\') return false; ' +
    'if (Array.isArray(measurement)) return false; ' +
    'const r = measurement.rounds; ' +
    'return Number.isInteger(r) && r >= 1; }',
    'M4 must not touch the M1 predicate — it adds ELIGIBILITY, not a new definition');
});

test('M4 — classifyRoundStructure is total', function () {
  [undefined, null, 0, 1, 'x', [], [1, 2], true, function () {}, { rounds: {} },
    { rounds: [], quorum: [] }, { rounds: null, quorum: 'x' }, Object.create(null),
  ].forEach(function (input, i) {
    // 라벨에 입력을 넣지 않는다 — `Object.create(null)` 은 primitive 변환이 없어서
    // 실패 메시지를 만드는 것 자체가 throw한다(그러면 test 가 대상이 아니라 자기 자신의
    // 라벨 때문에 붉어진다). 위치가 어느 항목인지 말해 주는 것으로 충분하다.
    assert.doesNotThrow(function () { defs.classifyRoundStructure(input); },
      'total-input case #' + i + ' must not throw');
  });
});

// local code-review M1 — the shapes the FIRST implementation threw on. It built its
// reason with `JSON.stringify`, which is not a total function: circular structures,
// BigInt, and a throwing `toJSON` all raise TypeError/Error. None is reachable from
// today's callers (record.js builds the value; linkage-audit reads JSON.parse output),
// but this file is a dep-free predicate library the WRITE PATH imports, and
// `buildReviewRecord` declares never-throw while `cmdRecord`'s catch turns any throw
// into NO RECORD AT ALL — the sample loss DD4 exists to prevent. So the contract is
// asserted against the shapes that actually break it, not only against tidy ones.
test('M4 — the totality contract holds for the shapes JSON.stringify cannot serialize', function () {
  const circular = { rounds: {} };
  circular.rounds.self = circular.rounds;

  const throwingToJson = { rounds: { toJSON: function () { throw new Error('boom'); } } };

  const cases = [
    ['circular', circular],
    ['bigint', { rounds: BigInt(1) }],
    ['throwing toJSON', throwingToJson],
    ['circular quorum evidence', (function () {
      const m = { rounds: null, quorum: { responded: {} } };
      m.quorum.responded.self = m.quorum.responded;
      return m;
    }())],
    ['bigint quorum evidence', { rounds: null, quorum: { responded: BigInt(3) } }],
  ];

  cases.forEach(function (c) {
    let r;
    assert.doesNotThrow(function () { r = defs.classifyRoundStructure(c[1]); },
      c[0] + ' must not throw — a total function has no exceptions for awkward input');
    assert.ok(defs.ROUND_STRUCTURE_VERDICTS.indexOf(r.verdict) !== -1);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
  });

  // 그리고 소스가 그 함수를 아예 부르지 않는다 — 위는 행동이고 이것은 구조다.
  const src = fs.readFileSync(DEFS_PATH, 'utf8');
  const body = src.slice(src.indexOf('function classifyRoundStructure'),
    src.indexOf('// ── D2 — 리뷰 대상 ship'));
  assert.ok(body.indexOf('JSON.stringify') === -1,
    'a module whose header declares every function total cannot reach for a serializer ' +
    'that throws; summarise the SHAPE instead of serialising the value');
});

// 반신뢰 입력이 사유 문장의 크기를 정하지 못한다. `by_reason` 은 사유를 맵 KEY 로 쓰므로
// 값을 그대로 실으면 레코드 하나가 감사 출력의 카디널리티와 크기를 동시에 늘린다.
test('M4 — a reason never carries the untrusted value itself, only its shape', function () {
  const huge = 'x'.repeat(100000);
  const r = defs.classifyRoundStructure({ rounds: huge });
  assert.equal(r.verdict, 'absent');
  assert.ok(r.reason.indexOf(huge) === -1, 'the value must not be echoed into the reason');
  assert.ok(r.reason.length < 500, 'a reason is bounded regardless of its input');

  // 숫자는 여전히 그 값을 말한다 — 무엇이 왜 정수가 아닌지가 사유의 요점이기 때문이다.
  assert.match(defs.classifyRoundStructure({ rounds: 0 }).reason, /\b0\b/);
  assert.match(defs.classifyRoundStructure({ rounds: 1.5 }).reason, /1\.5/);
});

// ── M5 DD5 — 라이브 사유 정련 ────────────────────────────────────────────────

test('M5 DD5 — the sealed reason strings are UNCHANGED (frozen corpus keys)', function () {
  // 이 단언이 지키는 것: 정련을 넣으면서 원래 문자열을 "겸사겸사" 고치는 것.
  // 그 문자열은 `docs/review-record-linkage/frozen-baseline.md` 에 축자 커밋된
  // `by_reason` 키이고, 움직이지 않는 것 자체가 UI6 의 계약이다.
  const noField = defs.classifyShipEligibility({ meta: { command: '/x' } });
  assert.equal(noField.reason,
    'no explicit meta.plan_review_expected — and nothing else in a ship receipt decides it ' +
    '(plan_hash and meta.command are present on every receipt; the upstream plan receipt ' +
    'was never git-tracked)');
  const unexplained = defs.classifyShipEligibility({ meta: { plan_review_expected: false } });
  assert.equal(unexplained.reason,
    'meta.plan_review_expected=false but meta.no_plan_review_reason is absent or empty — ' +
    'an unexplained exclusion is not a decision');
  assert.equal(defs.classifyShipEligibility(null).reason, 'receipt has no readable meta object');
});

test('M5 DD5 — refinement applies to the no_explicit_field branch ONLY', function () {
  const live = defs.LIVE_UNDECIDABLE_REASONS;

  // 적용 대상 — M3 키가 하나도 없다.
  const absent = { meta: { command: '/x', plan_path: '.claude/plans/p.md' } };
  const rAbsent = defs.refineLiveUndecidableReason(absent, defs.classifyShipEligibility(absent));
  assert.equal(rAbsent.reason, live.producerAbsent);
  assert.equal(rAbsent.verdict, 'undecidable', 'refinement must not change the verdict');

  // 적용 대상 — M3 키가 있는데 자격 키만 없다.
  defs.M3_PRODUCER_KEYS.forEach(function (key) {
    if (key === 'plan_review_expected') return;   // 있으면 다른 갈래로 간다
    const meta = { command: '/x' };
    meta[key] = 'whatever';
    const rec = { meta: meta };
    const out = defs.refineLiveUndecidableReason(rec, defs.classifyShipEligibility(rec));
    assert.equal(out.reason, live.producerPresentUnstamped, 'key ' + key + ' proves the producer existed');
  });

  // 비적용 — 나머지 두 undecidable 갈래는 손대지 않는다 (L2 architect MEDIUM 흡수).
  // 그 둘은 M3 키를 물을 수 없거나(판독 불가) 이미 다른 축의 결함이므로(무증거
  // exclusion), 같은 규칙을 적용하면 없는 사실을 만든다.
  [null, { meta: null }, { meta: 'nope' }].forEach(function (rec) {
    const base = defs.classifyShipEligibility(rec);
    const out = defs.refineLiveUndecidableReason(rec, base);
    assert.equal(out.reason, base.reason, 'the meta-unreadable branch must pass through');
  });
  const unexplained = { meta: { plan_review_expected: false } };
  const uBase = defs.classifyShipEligibility(unexplained);
  assert.equal(defs.refineLiveUndecidableReason(unexplained, uBase).reason, uBase.reason,
    'the unexplained-exclusion branch must pass through');

  // 비적용 — 판정된 것들.
  [{ meta: { plan_review_expected: true } },
   { meta: { plan_review_expected: false, no_plan_review_reason: 'chore only' } }].forEach(function (rec) {
    const base = defs.classifyShipEligibility(rec);
    const out = defs.refineLiveUndecidableReason(rec, base);
    assert.equal(out.reason, base.reason);
    assert.notEqual(out.reason, live.producerAbsent);
    assert.notEqual(out.reason, live.producerPresentUnstamped);
  });
});

test('M5 DD5 — a present-but-non-boolean eligibility key still proves the producer ran', function () {
  // `plan_review_expected: null` 은 `true` 도 `false` 도 아니라 fallthrough 로
  // 떨어지지만, 키가 있다는 것은 그 빌드에 생산자가 있었다는 뜻이다. 값 검사가
  // 아니라 **키 존재** 검사여야 하는 이유다.
  [null, 'yes', 0, []].forEach(function (v) {
    const rec = { meta: { plan_review_expected: v } };
    const base = defs.classifyShipEligibility(rec);
    assert.equal(base.code, defs.ELIGIBILITY_CODES.noExplicitField, 'value ' + JSON.stringify(v));
    const out = defs.refineLiveUndecidableReason(rec, base);
    assert.equal(out.reason, defs.LIVE_UNDECIDABLE_REASONS.producerPresentUnstamped);
  });
});

test('M5 DD5 — the two live reasons are mutually exclusive for a single receipt', function () {
  const live = defs.LIVE_UNDECIDABLE_REASONS;
  const both = { meta: { review_record_path: '.claude/reviews/x.md' } };
  const out = defs.refineLiveUndecidableReason(both, defs.classifyShipEligibility(both));
  assert.equal(out.reason, live.producerPresentUnstamped);
  assert.notEqual(out.reason, live.producerAbsent);
});

test('M5 DD5 — classification codes are additive; verdict and reason keep their meaning', function () {
  // `code` 는 하류가 사유 **문자열을 파싱하지 않도록** 주는 필드다. 문자열 파싱은
  // 동결 코퍼스를 깨뜨리지 않고 분기하는 유일한 대안이었고, 그것은 깨지기 쉽다.
  const codes = defs.ELIGIBILITY_CODES;
  const seen = {};
  [null,
   { meta: { plan_review_expected: true } },
   { meta: { plan_review_expected: false, no_plan_review_reason: 'x' } },
   { meta: { plan_review_expected: false } },
   { meta: {} }].forEach(function (rec) {
    const r = defs.classifyShipEligibility(rec);
    assert.equal(typeof r.verdict, 'string');
    assert.equal(typeof r.reason, 'string');
    assert.equal(typeof r.code, 'string');
    seen[r.code] = true;
  });
  Object.keys(codes).forEach(function (k) {
    assert.ok(seen[codes[k]], 'code ' + codes[k] + ' is unreachable — an enum value no input produces');
  });
});

test('M5 DD5 — refineLiveUndecidableReason is total', function () {
  const hostile = [
    [undefined, undefined], [null, null], [{}, {}], [{ meta: 1 }, { code: 'nope' }],
    [{ meta: {} }, null], [{ meta: {} }, { code: defs.ELIGIBILITY_CODES.noExplicitField }],
  ];
  hostile.forEach(function (pair, i) {
    assert.doesNotThrow(function () { defs.refineLiveUndecidableReason(pair[0], pair[1]); }, 'case ' + i);
  });
});
