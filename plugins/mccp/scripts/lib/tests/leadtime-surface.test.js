'use strict';

// leadtime-observability M3 — 한 줄 포매터 회귀 test.
//
// 고정하는 것은 **표기 규칙**이다: 값 부재는 `0`이 아니라 `미산출`이고, 모든 값
// 토큰에 커버리지가 인접하며, 두 앵커는 절대 합쳐지지 않고, 구조적으로 0인
// 지표 4는 한 줄에 실리지 않는다.
//
// 실코퍼스 리터럴 카운트는 쓰지 않는다 — 코퍼스는 게이트 실행마다 자라므로 반드시
// 붉어진다(`leadtime.test.js` 헤더 규약). 픽스처와 관계 단언만 둔다.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ABSENT,
  fmtMin,
  fmtDay,
  emptySummary,
  formatLeadtimeLine,
  assertCoverageAdjacency,
} = require('../leadtime-surface');

const MIN = 60000;
const DAY = 86400000;

// ── 픽스처 빌더 ──────────────────────────────────────────────────────────────

function summary(over) {
  const base = emptySummary([]);
  base.state = 'ok';
  base.coverage = { panel_records: 62, measurable: 49, counts_are_lower_bound: true };
  base.panel_span = { n: 49, min: 1 * MIN, p50: 7.6 * MIN, p90: 12 * MIN, max: 400 * MIN };
  base.post_panel_span.by_anchor.ledger_basename = { n: 11, p50: 0.38 * DAY, p90: DAY, max: 2 * DAY };
  base.post_panel_span.by_anchor.ship_plan_hash = { n: 17, p50: 0.28 * DAY, p90: 4 * DAY, max: 6 * DAY };
  base.post_panel_span.coverage = {
    eligible: 49, matched_ledger: 11, matched_ship: 17,
    both: 6, only_ledger: 5, only_ship: 11, neither: 27,
  };
  return Object.assign(base, over || {});
}

// ── 1. 값 부재는 0이 아니다 (UI3) ────────────────────────────────────────────

test('an absent value says 미산출 and never renders as a zero quantity', () => {
  const blind = emptySummary([]);
  blind.coverage.panel_records = 62;
  const t = formatLeadtimeLine(blind).text;

  assert.ok(t.includes(ABSENT), 'absent value must say 미산출');
  assert.ok(!/\b0(\.\d+)?(min|d)\b/.test(t), 'absence must not be written as 0min/0d: ' + t);
  assert.ok(!t.includes('0분') && !t.includes('0일'), 'no zero-valued Korean unit either');
});

test('an absent value still carries its coverage — UI2 has no exception for absence', () => {
  const blind = emptySummary([]);
  blind.coverage.panel_records = 62;
  const t = formatLeadtimeLine(blind).text;
  assert.ok(t.includes('/62'), 'the corpus denominator survives a blind run: ' + t);
  assertCoverageAdjacency(t);
});

// ── 2. DD14 인접성 — 짝 없는 값은 존재할 수 없다 ────────────────────────────

test('every value token in the line has an adjacent coverage pair', () => {
  assertCoverageAdjacency(formatLeadtimeLine(summary()).text);
});

// 이 짝 test 가 없으면 위 단언은 no-op 일 수 있다 — 게이트가 **실제로 실패할 수
// 있음**을 고정한다.
test('assertCoverageAdjacency actually fails on a line whose pair was removed', () => {
  const good = formatLeadtimeLine(summary()).text;
  const stripped = good.replace(/ \(\d+\/\d+\)/, '');
  assert.notEqual(stripped, good, 'the fixture must really differ from the good line');
  assert.throws(() => assertCoverageAdjacency(stripped), /adjacent coverage/);
});

test('assertCoverageAdjacency rejects a line that does not lead with corpus coverage', () => {
  assert.throws(() => assertCoverageAdjacency('패널 7.6min (49/49)'), /corpus coverage/);
});

test('assertCoverageAdjacency rejects a line with no value token at all', () => {
  assert.throws(() => assertCoverageAdjacency('리드타임 (0/0 측정) · p50:'), /no value token/);
});

// ── 3. UI8 — 두 앵커는 각각 뜬다 ────────────────────────────────────────────

test('both anchor series appear separately — they are never collapsed into one', () => {
  const t = formatLeadtimeLine(summary()).text;
  assert.ok(t.includes('ledger'), 'ledger series named: ' + t);
  assert.ok(t.includes('hash'), 'ship_plan_hash series named: ' + t);
  assert.ok(t.includes(fmtDay(0.38 * DAY)), 'ledger value present');
  assert.ok(t.includes(fmtDay(0.28 * DAY)), 'ship value present');
});

test('one joined anchor does not substitute for the other — the empty one says 미산출', () => {
  const s = summary();
  s.post_panel_span.by_anchor.ship_plan_hash = null;
  s.post_panel_span.coverage.matched_ship = 0;
  const t = formatLeadtimeLine(s).text;
  assert.ok(t.includes(fmtDay(0.38 * DAY)), 'the joined anchor keeps its value');
  assert.ok(t.includes(ABSENT), 'the unjoined anchor says 미산출 rather than borrowing');
  assertCoverageAdjacency(t);
});

// ── 4. DD11 — 지표 4는 한 줄에 없다 ─────────────────────────────────────────

test('the line never sells the structurally-zero disagreement metric', () => {
  const s = summary();
  s.post_panel_span.disagreement = { n: 6, p50: 0, max: 0 };
  const t = formatLeadtimeLine(s).text;
  assert.ok(!/불일치|disagreement/.test(t),
    'a structurally-zero identity must not read as agreement: ' + t);
});

// ── 5. DD3 — degraded 는 값을 지우지 않고 꼬리표만 더한다 ───────────────────

test('a degraded state keeps the values and adds a separate note line', () => {
  const s = summary({ state: 'degraded', degradations: ['parse-failures'] });
  const out = formatLeadtimeLine(s);
  assert.ok(out.text.includes(fmtMin(7.6 * MIN)), 'degraded still reports the value');
  assert.ok(out.parts.note, 'a degraded run carries a note');
  assert.ok(out.parts.note.includes('parse-failures'), 'the note names the degradation');
  assert.ok(!out.text.includes(out.parts.note), 'the note is a SEPARATE line, not appended');
});

test('a blind state names why rather than leaving the absence unexplained', () => {
  const s = emptySummary([]);
  const note = formatLeadtimeLine(s).parts.note;
  assert.ok(note && note.includes(ABSENT), 'a blind run explains the absence');

  const withReason = formatLeadtimeLine(emptySummary(['read-error'])).parts.note;
  assert.ok(withReason.includes('read-error'), 'a known degradation is named: ' + withReason);
});

// ── 6. DD13 — 포매터도 산술을 하지 않는다 ───────────────────────────────────

test('a non-finite value is 미산출, never coerced to a number', () => {
  const s = summary();
  s.panel_span = { n: 3, min: null, p50: null, p90: null, max: null };
  const t = formatLeadtimeLine(s).text;
  assert.ok(t.includes(ABSENT), 'null p50 renders as 미산출: ' + t);
  assert.ok(!t.includes('NaN') && !t.includes('undefined'), 'no coercion leakage: ' + t);
});

test('the unit vocabulary is owned here and is stable', () => {
  assert.equal(fmtMin(90000), '1.5min');
  assert.equal(fmtDay(1.5 * DAY), '1.50d');
});

// ── 7. 결정성 ───────────────────────────────────────────────────────────────

test('the same summary always formats to the same line', () => {
  assert.equal(formatLeadtimeLine(summary()).text, formatLeadtimeLine(summary()).text);
});

test('a missing summary degrades to an all-absent line instead of throwing', () => {
  const t = formatLeadtimeLine(null).text;
  assert.ok(t.includes(ABSENT));
  assertCoverageAdjacency(t);
});
