'use strict';

// leadtime-observability M1 Task 2 — panel_span 집계 오라클 회귀 test.
//
// 이 test가 고정하는 것은 **부재 규칙 · 백분위 · 경로 정규화 · 층화 키**다. 실코퍼스에
// 대한 경험적 주장(p50 값, 커버리지 수치)은 픽스처로 증명되지 않는다 — 그 반증은 도구를
// 실제 코퍼스에 돌린 출력을 문서에 축자 동결하는 것으로 성립한다. 여기서 주장하지 않고
// 그 한계를 명시한다.
//
// 특히 지키는 것 넷:
//   - 부재를 0으로 접지 않는다 (blind · wall_clock 결측 · 관측 0건인 층).
//   - `read_error`가 사다리에 있다 — 읽기 실패가 커버리지 100%로 접히지 않는다.
//   - 절대경로 `plan_path`가 커밋 산출물로 새지 않는다.
//   - `corpus.aggregate`의 출력이 한 바이트도 바뀌지 않았다(결정 3의 기계적 강제).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregate,
  percentile,
  normalizePlanPath,
  renderHuman,
  COMPLETED_KEY,
  NON_REPO_PATH,
  exitCodeForState,
} = require('../leadtime');

const corpus = require('../plan-review/corpus');

// ── 픽스처 빌더 (실코퍼스 미의존) ─────────────────────────────────────────────

function record(opts) {
  const o = opts || {};
  const hasMeasurement = o.measurement !== null;
  const measurement = Object.assign({
    verdict: 'divergent',
    source: 'multi-agent',
    layers: { l1: 'converged', l2: 'divergent', l3: null },
    quorum: { responded: 4, required: 3, roles: 4, of: 4, passed: false },
    wall_clock_ms: 120000,
    halt_stage: null,
    reviewed_plan_hash: 'sha256:deadbeef',
    plan_path: '.claude/plans/x.plan.md',
    recorded_at: '2026-08-22T00:00:00.000Z',
  }, o.measurement || {});

  const L = [];
  L.push(o.title === undefined ? '# Plan Review Panel — fixture' : o.title);
  L.push('');
  L.push('**Verdict**: `' + measurement.verdict + '` via `multi-agent`');
  L.push('');
  L.push('> Reason: 3 blocking finding(s): test/HIGH');
  L.push('');
  L.push('## Findings');
  L.push('');
  L.push('| Perspective | Severity | Claim | Evidence |');
  L.push('|---|---|---|---|');
  L.push('| test | HIGH | c | e |');
  L.push('');
  L.push('## Refutation attempted');
  L.push('');
  L.push('| Perspective | Verdict | What was attacked |');
  L.push('|---|---|---|');
  L.push('| test | fail | x |');
  L.push('');
  if (hasMeasurement) {
    L.push('## Measurement');
    L.push('');
    L.push('```json');
    L.push(o.rawMeasurement === undefined
      ? JSON.stringify(measurement, null, 2)
      : o.rawMeasurement);
    L.push('```');
    L.push('');
  }
  return { name: o.name || 'fixture.md', text: L.join('\n') };
}

// ── 1. wall_clock_ms=null은 n에 들어가지 않고 이름으로 남는다 (부재 규칙 b) ──

test('a null wall_clock_ms is excluded from the distribution and named, never folded to zero', () => {
  const out = aggregate([
    record({ name: 'a.md', measurement: { wall_clock_ms: 60000 } }),
    record({ name: 'b.md', measurement: { wall_clock_ms: null } }),
    record({ name: 'c.md', measurement: { wall_clock_ms: 180000 } }),
  ]);

  assert.equal(out.state, 'ok');
  assert.equal(out.records, 3);
  assert.equal(out.panel_span.n, 2, 'the null record must not enter the distribution');
  assert.equal(out.coverage.panel_span_observed, 2);
  assert.equal(out.coverage.panel_span_missing, 1);
  assert.deepEqual(out.coverage.panel_span_missing_records, ['b.md']);
  // 0으로 접혔다면 min이 0이 된다. 그 사실이 이 단언의 전부다.
  assert.equal(out.panel_span.min, 60000);
  assert.equal(out.panel_span.records.length, 2);
});

// ── 2. 관측 0건이면 blind · exit 2 · panel_span 키 부재 (부재 규칙 a) ────────

test('zero measurable records is blind, exit 2, and carries no panel_span key', () => {
  const out = aggregate([]);
  assert.equal(out.state, 'blind');
  assert.equal(exitCodeForState(out.state), 2);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'panel_span'), false,
    'an empty distribution key would let a consumer read absence as an observation');
});

test('records that all lack wall_clock_ms are blind too — not ok with an empty distribution', () => {
  const out = aggregate([
    record({ name: 'a.md', measurement: { wall_clock_ms: null } }),
    record({ name: 'b.md', measurement: { wall_clock_ms: undefined } }),
  ]);
  assert.equal(out.records, 2, 'the records themselves parsed fine');
  assert.equal(out.state, 'blind', 'the AXIS has no observation, so no value may be reported');
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'panel_span'), false);
  assert.equal(out.coverage.panel_span_observed, 0);
  assert.equal(out.coverage.panel_span_missing, 2);
});

// ── 3. pre_measurement는 state를 바꾸지 않지만 하한을 명시한다 ───────────────

test('a pre-measurement record keeps state ok while marking counts as a lower bound', () => {
  const out = aggregate([
    record({ name: 'a.md' }),
    record({ name: 'old.md', measurement: null }),
  ]);
  assert.equal(out.state, 'ok');
  assert.equal(out.pre_measurement, 1);
  assert.deepEqual(out.pre_measurement_records, ['old.md']);
  assert.equal(out.coverage.panel_records, 2);
  assert.equal(out.coverage.measurable, 1);
  assert.equal(out.coverage.counts_are_lower_bound, true);
});

// ── 4. parse_failure 1건이면 degraded · exit 1 ───────────────────────────────

test('a single parse failure degrades the run and exits 1', () => {
  const out = aggregate([
    record({ name: 'a.md' }),
    record({ name: 'bad.md', rawMeasurement: '{ not json' }),
  ]);
  assert.equal(out.parse_failures, 1);
  assert.equal(out.state, 'degraded');
  assert.equal(exitCodeForState(out.state), 1);
  // degraded여도 읽힌 것은 보고한다 — 부분 관측을 버리지 않는다.
  assert.equal(out.panel_span.n, 1);
});

// ── 4b. read_error는 사다리에 있다 (fail-open 차단) ─────────────────────────

test('a read error degrades the run even when every record that WAS read parsed cleanly', () => {
  const out = aggregate([record({ name: 'a.md' })], { readError: true });
  assert.equal(out.parse_failures, 0);
  assert.equal(out.read_error, true);
  assert.equal(out.state, 'degraded',
    'without read_error in the ladder a failed directory read folds into 100% coverage');
  assert.equal(exitCodeForState(out.state), 1);
});

test('a read error with zero records is degraded, not blind', () => {
  const out = aggregate([], { readError: true });
  assert.equal(out.state, 'degraded');
});

// ── 5. nearest-rank 백분위 ──────────────────────────────────────────────────

test('nearest-rank percentiles match known inputs, including n=1 and n=2 edges', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // ceil(0.5*10)=5 → 5번째 = 5 · ceil(0.9*10)=9 → 9번째 = 9
  assert.equal(percentile(ten, 50), 5);
  assert.equal(percentile(ten, 90), 9);
  assert.equal(percentile(ten, 0), 1, 'rank clamps to 1, so p0 is the minimum');
  assert.equal(percentile(ten, 100), 10);

  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 90), 42);

  // ceil(0.5*2)=1 → sorted[0] · ceil(0.9*2)=2 → sorted[1]
  assert.equal(percentile([10, 20], 50), 10);
  assert.equal(percentile([10, 20], 90), 20);

  assert.equal(percentile([], 50), null);
});

test('the distribution reports its method so the claim is recomputable', () => {
  const out = aggregate([record({ name: 'a.md' })]);
  assert.equal(out.panel_span.method, 'nearest-rank');
  assert.equal(out.panel_span.unit, 'ms');
});

// ── 6. 관측 0건인 층은 키가 생기지 않는다 (부재 규칙 c) ─────────────────────

test('strata with zero observations get no key at all', () => {
  const out = aggregate([
    record({ name: 'a.md', measurement: { verdict: 'converged', halt_stage: null } }),
    record({ name: 'b.md', measurement: { verdict: 'divergent', halt_stage: '5.2e' } }),
  ]);
  assert.deepEqual(Object.keys(out.panel_span.by_verdict).sort(), ['converged', 'divergent']);
  assert.equal('critical' in out.panel_span.by_verdict, false);
  assert.equal('unavailable' in out.panel_span.by_verdict, false);
  assert.deepEqual(Object.keys(out.panel_span.by_halt_stage).sort(), ['5.2e', COMPLETED_KEY].sort());
  assert.equal('5.2b' in out.panel_span.by_halt_stage, false);
});

test('a null halt_stage is named as completed rather than dropped', () => {
  const out = aggregate([record({ name: 'a.md', measurement: { halt_stage: null } })]);
  assert.equal(out.panel_span.by_halt_stage[COMPLETED_KEY].n, 1);
});

// ── 7. 사람이 읽는 출력에 커버리지가 반드시 동반된다 (UI3) ──────────────────

test('every rendered output carries coverage, blind included', () => {
  const ok = renderHuman(aggregate([record({ name: 'a.md' })]));
  assert.match(ok, /coverage:/);
  assert.match(ok, /panel_span observed 1\/1/);

  const blind = renderHuman(aggregate([]));
  assert.match(blind, /coverage:/, 'a blind run must still state its denominator');
  assert.match(blind, /absence is not a value of zero/);
});

// ── 7b. plan_path 정규화 — 절대경로가 커밋 산출물로 새지 않는다 ─────────────

test('an absolute plan_path inside the repo is folded to a repo-relative posix path', () => {
  assert.equal(
    normalizePlanPath('/repo/.claude/plans/x.plan.md', '/repo'),
    '.claude/plans/x.plan.md');
  assert.equal(
    normalizePlanPath('C:\\repo\\.claude\\plans\\x.plan.md', 'C:\\repo'),
    '.claude/plans/x.plan.md');
});

test('an absolute plan_path outside the repo is replaced by a marker, never emitted', () => {
  const out = normalizePlanPath('/home/someone/secret/x.plan.md', '/repo');
  assert.equal(out, NON_REPO_PATH);
  assert.equal(out.includes('someone'), false, 'the machine-specific path must not survive');
});

test('a relative plan_path is kept, with separators normalized', () => {
  assert.equal(normalizePlanPath('.claude\\plans\\x.plan.md', '/repo'), '.claude/plans/x.plan.md');
  assert.equal(normalizePlanPath(null, '/repo'), null);
  assert.equal(normalizePlanPath('', '/repo'), null);
});

test('aggregate normalizes plan_path before it reaches records[]', () => {
  const out = aggregate(
    [record({ name: 'a.md', measurement: { plan_path: '/repo/.claude/plans/x.plan.md' } })],
    { repoRoot: '/repo' });
  assert.equal(out.panel_span.records[0].plan_path, '.claude/plans/x.plan.md');
});

test('without a repoRoot an absolute plan_path still cannot leak', () => {
  const out = aggregate(
    [record({ name: 'a.md', measurement: { plan_path: '/home/someone/x.plan.md' } })]);
  assert.equal(out.panel_span.records[0].plan_path, NON_REPO_PATH);
});

// ── 8. 결정 3 동결 — corpus.aggregate의 출력이 바뀌지 않았다 ────────────────

const CORPUS_FROZEN = `{
  "tool": "plan-review-corpus",
  "state": "ok",
  "files_scanned": 1,
  "records": 1,
  "pre_measurement": 0,
  "pre_measurement_records": [],
  "out_of_corpus": 0,
  "parse_failures": 0,
  "read_error": false,
  "parse_errors": [],
  "sources": [],
  "coverage": {
    "panel_records": 1,
    "measurable": 1,
    "unmeasurable": 0,
    "counts_are_lower_bound": false
  },
  "verdicts": {
    "divergent": 1
  },
  "sources_seen": {
    "multi-agent": 1
  },
  "pass_path": {
    "count": 0,
    "entries": [],
    "single_pass_tainted": 0,
    "hash_bound": 0,
    "wall_clock_ms_observed": []
  },
  "single_pass": {
    "records": 0,
    "converged": 0,
    "blocked": 0,
    "record_names": []
  },
  "perspectives": {
    "test": {
      "pass": 0,
      "fail": 1,
      "other": 0,
      "total": 1
    }
  },
  "binding_axis": {
    "blocked_records": 1,
    "quorum_evaluated_blocked": 1,
    "m_binding": 0,
    "k_binding": 0,
    "findings_binding": 1,
    "unknown": 0,
    "unknown_records": [],
    "l2_not_evaluated": 0,
    "cross_check_conflicts": []
  },
  "f6": {
    "fail_reviewer_instances": 1,
    "solo_fail_reviewer_instances": 0,
    "solo_fail_records": [],
    "records_flipped_if_f6_removed": 0,
    "flipped_records": [],
    "severity_histogram": {
      "HIGH": 1
    }
  },
  "k_split": {
    "state": "unresolved",
    "ref": "794c4de",
    "reason": "split commit timestamp not resolved"
  }
}`;

test('corpus.aggregate output is byte-identical to the frozen literal (decision 3)', () => {
  const out = corpus.aggregate([record({ name: 'a.md' })], {});
  const actual = JSON.stringify(out, null, 2);
  assert.equal(actual, CORPUS_FROZEN,
    'corpus.js output changed. leadtime-observability M1 promised NOT to change it — ' +
    'the only edit it makes is an additive module.exports line. If another PRD changed ' +
    'this deliberately, update BOTH this literal and the frozen block in ' +
    'docs/diverse-agent-review/quorum-calibration.md together.');
});

test('the additive exports corpus.js gained are the corpus boundary, not a copy of it', () => {
  assert.equal(typeof corpus.readReviewRecords, 'function');
  assert.ok(Array.isArray(corpus.REVIEW_SUBDIRS));
  assert.equal(corpus.REVIEW_SUBDIRS.length, 2);
});
