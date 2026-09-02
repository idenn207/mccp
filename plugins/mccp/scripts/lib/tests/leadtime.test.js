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
//
// M2가 더하는 것 넷:
//   - 두 앵커 계열이 **각각** 나오고 절대 합쳐지지 않는다(DD2).
//   - 미짝 5종 분류가 **전부 도달 가능**하고 합계 등식이 성립한다(DD4).
//   - `unavailable`이 `no`로 접히지 않는다 — 같은 입력에서 증인 하나만 바꾸면
//     `unclassified` ↔ `not_shipped`가 갈린다(짝 test).
//   - ship 자격은 `pr-ship-gate.js` 오라클의 반환값이며, **포함되면 안 되는 것이
//     조용히 포함되는** 위험한 방향까지 덮는다(무증거 skip 배제 · override 포함).
//
// 실코퍼스 리터럴 카운트는 여기 쓰지 않는다 — 코퍼스는 게이트 실행마다 자라므로
// 반드시 붉어진다. 관계 단언만 둔다.

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
  ANCHOR_SERIES,
  UNMATCHED_REASONS,
  WITNESSES,
  pickAnchor,
  qualifyShipReceipts,
  compositeState,
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

// ═════════════════════════════════════════════════════════════════════════════
// M2 — post_panel_span 회귀
// ═════════════════════════════════════════════════════════════════════════════

const PANEL_T = '2026-08-20T00:00:00.000Z';
const PANEL_MS = Date.parse(PANEL_T);
const DAY = 86400000;

function panelRecord(name, opts) {
  const o = opts || {};
  return record({
    name: name,
    measurement: Object.assign({
      recorded_at: PANEL_T,
      plan_path: '.claude/plans/' + (o.slug || 'p') + '.plan.md',
      reviewed_plan_hash: 'sha256:' + (o.slug || 'p'),
    }, o.measurement || {}),
  });
}

function src(over) {
  return Object.assign({ dir: 'd', present: true, read_error: false, parse_failures: 0, files: 0 }, over || {});
}

function ledgerEntry(slug, offsetMs, over) {
  return Object.assign({
    decision_id: slug,
    plan_basename: slug + '.plan.md',
    plan_file_hash: 'sha256:' + slug,
    completed_at: new Date(PANEL_MS + offsetMs).toISOString(),
  }, over || {});
}

function shipReceipt(slug, offsetMs, over) {
  return Object.assign({
    decision_id: slug,
    plan_hash: 'sha256:' + slug,
    resolution: { codex_verdict: 'converged' },
    meta: { created_at: new Date(PANEL_MS + offsetMs).toISOString() },
  }, over || {});
}

// 축은 관측이 1건이라도 있어야 실린다(부재 규칙 (a) — damaged가 아니고 관측
// 0건이면 키를 만들지 않는다). 그래서 **사유 분해나 ship 집계를 단언하는 test**는
// 조인되는 레코드를 하나 끼워 축을 실어야 한다. 이 carrier가 그것이고, ledger
// 계열에서만 매치되므로 다른 레코드의 증인 판정에는 영향을 주지 않는다
// (`plan_file_hash`/`decision_id`가 달라 key_mismatch도 유발하지 않는다).
const CARRIER_SLUG = 'carrier';
function carrierRecord() { return panelRecord('carrier.md', { slug: CARRIER_SLUG }); }
function carrierLedger() { return ledgerEntry(CARRIER_SLUG, DAY); }

// 기본 앵커 묶음: 모든 소스가 present·건강. 개별 test가 필요한 축만 덮어쓴다.
function anchors(over) {
  const o = over || {};
  return {
    ledger: { entries: o.ledgerEntries || [], source: src(o.ledgerSource) },
    ship: { receipts: o.shipReceipts || [], source: src(o.shipSource) },
    archived: { basenames: o.archived || [], source: src(o.archivedSource) },
    implement: { slugs: o.implement || [], source: src(o.implementSource) },
    git: Object.assign({ available: true, touched: [], reason: 'ok' }, o.git || {}),
  };
}

// ── M2-1. 두 계열은 각각 나오고 절대 합쳐지지 않는다 (DD2) ──────────────────

test('post_panel_span emits TWO independent anchor series and no merged summary key', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({
      ledgerEntries: [ledgerEntry('a', 1 * DAY)],
      shipReceipts: [shipReceipt('a', 2 * DAY)],
    }),
  });
  const s = out.post_panel_span;
  assert.deepEqual(Object.keys(s.by_anchor).sort(), ANCHOR_SERIES.slice().sort());
  // 구조 단언이다 — 두 계열의 관측 수 **대소를 비교하지 않는다**. 코퍼스가 자라면
  // 동수가 될 수 있고, 그때 정상 동작이 실패로 읽힌다.
  assert.equal(s.by_anchor.ledger_basename.n, 1);
  assert.equal(s.by_anchor.ship_plan_hash.n, 1);
  assert.equal(s.by_anchor.ledger_basename.p50, 1 * DAY);
  assert.equal(s.by_anchor.ship_plan_hash.p50, 2 * DAY);
  // 병합 금지: 최상위에 요약 통계가 살 수 없다. 키 whitelist라 p50 아닌 이름으로
  // 병합이 들어와도 잡힌다.
  const ALLOWED = new Set(['state', 'unit', 'method', 'by_anchor', 'disagreement',
    'negative_spans', 'unmatched', 'coverage']);
  assert.deepEqual(Object.keys(s).filter((k) => !ALLOWED.has(k)), []);
  // DD11 — 이중 컨테이너가 돌아오면 실패.
  assert.equal('axes' in out, false);
  assert.equal('axes_present' in out, false);
  assert.equal('axis' in out, false, 'the top-level axis scalar cannot represent two axes');
});

// ── M2-2. 음수 span은 clamp되지 않고 보고되며 그 축을 degraded로 만든다 (DD6) ─

test('an anchor that PRECEDES the panel yields a negative span, reported and degrading', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({ ledgerEntries: [ledgerEntry('a', -3 * DAY)] }),
  });
  const s = out.post_panel_span;
  assert.equal(s.negative_spans.length, 1, 'DD5 fallback must make DD6 reachable at all');
  assert.equal(s.negative_spans[0].span_ms, -3 * DAY);
  assert.equal(s.negative_spans[0].anchor, 'ledger_basename');
  // 0으로 접혔다면 "즉시 ship"이라는 없는 사실이 생긴다.
  assert.equal(s.by_anchor.ledger_basename.min, -3 * DAY);
  assert.equal(s.state, 'degraded');
  assert.equal(out.state, 'degraded');
  assert.equal(exitCodeForState(out.state), 1);
});

test('pickAnchor prefers the earliest AFTER the panel, else the latest BEFORE it', () => {
  const c = [{ at_ms: 100 }, { at_ms: 300 }, { at_ms: 50 }];
  assert.equal(pickAnchor(c, 200).at_ms, 300, 'earliest at-or-after the panel');
  assert.equal(pickAnchor(c, 400).at_ms, 300, 'no candidate after -> latest before');
  assert.equal(pickAnchor([], 400), null);
  assert.equal(pickAnchor([{ at_ms: null }], 400), null, 'unparseable anchor times are not candidates');
});

// ── M2-3~6. ship 자격은 오라클의 반환값이다 (DD14) ──────────────────────────

test('a divergent ship receipt with no override is NOT a ship anchor', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' }), carrierRecord()], {
    anchors: anchors({
      ledgerEntries: [carrierLedger()],
      shipReceipts: [shipReceipt('a', DAY, { resolution: { codex_verdict: 'divergent' } })],
    }),
  });
  assert.equal(out.post_panel_span.by_anchor.ship_plan_hash.n, 0);
  assert.equal(out.post_panel_span.coverage.ship_receipts_total, 1);
  assert.equal(out.post_panel_span.coverage.ship_receipts_qualified, 0);
});

test('a skipped verdict with NO sanctioned proof marker is not counted as a ship', () => {
  // hasSkipProof는 export되지 않으므로 이 층은 receipt **전체**(meta 포함)를
  // deriveShipDecision에 넘겼을 때만 발동한다 — 이 test가 곧 호출 형태의 검사다.
  const out = aggregate([panelRecord('a.md', { slug: 'a' }), carrierRecord()], {
    anchors: anchors({
      ledgerEntries: [carrierLedger()],
      shipReceipts: [shipReceipt('a', DAY, {
        resolution: { codex_verdict: 'skipped' },
        meta: { created_at: new Date(PANEL_MS + DAY).toISOString() },
      })],
    }),
  });
  const c = out.post_panel_span.coverage;
  assert.equal(c.ship_receipts_qualified, 0, 'an unproven skip must never anchor a ship');
  assert.equal(c.ship_receipts_unproven_skip, 1);
  assert.equal(out.post_panel_span.by_anchor.ship_plan_hash.n, 0);
});

test('a skipped verdict WITH a sanctioned proof marker does anchor a ship', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({
      shipReceipts: [shipReceipt('a', DAY, {
        resolution: { codex_verdict: 'skipped' },
        meta: { created_at: new Date(PANEL_MS + DAY).toISOString(), codex_dedupe_at_pr: true },
      })],
    }),
  });
  // 이 receipt는 자격을 얻어 실제로 조인되므로 축이 스스로 실린다 — carrier 불필요.
  assert.equal(out.post_panel_span.coverage.ship_receipts_qualified, 1);
  assert.equal(out.post_panel_span.by_anchor.ship_plan_hash.n, 1);
});

test('a divergent receipt WITH an audited force-override IS counted (opts must be bound)', () => {
  // forceOverrideActive를 안 묶으면 audited override로 실제 머지된 ship이
  // no-ship으로 접히고, DD4가 "증거를 요구하는 주장"으로 규정한 not_shipped가
  // 실제로 ship된 작업에 대해 거짓을 단언한다.
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({
      shipReceipts: [shipReceipt('a', DAY, {
        resolution: { codex_verdict: 'divergent' },
        meta: {
          created_at: new Date(PANEL_MS + DAY).toISOString(),
          pr_codex_force_override: true,
        },
      })],
    }),
  });
  const c = out.post_panel_span.coverage;
  assert.equal(c.ship_receipts_qualified, 1);
  assert.equal(c.ship_receipts_override_qualified, 1);
  assert.equal(out.post_panel_span.by_anchor.ship_plan_hash.n, 1);
});

test('the DD14 filter evidence fields are all present — an unobservable filter is not a filter', () => {
  const out = aggregate([carrierRecord()], {
    anchors: anchors({ ledgerEntries: [carrierLedger()] }),
  });
  const c = out.post_panel_span.coverage;
  ['ship_receipts_total', 'ship_receipts_qualified',
    'ship_receipts_unproven_skip', 'ship_receipts_override_qualified'].forEach((k) => {
    assert.equal(typeof c[k], 'number', k + ' must be present, not undefined');
  });
});

test('qualifyShipReceipts delegates to the ship-gate oracle rather than reimplementing it', () => {
  const calls = [];
  const fake = {
    deriveShipDecision: function (receipt, opts) {
      calls.push({ receipt: receipt, opts: opts });
      return { ship: false, blockingVerdict: 'divergent' };
    },
  };
  const r = shipReceipt('a', DAY, { meta: { created_at: 'x', pr_codex_force_override: true } });
  qualifyShipReceipts([r], fake);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receipt, r, 'the WHOLE receipt (meta included) must be passed');
  assert.equal(calls[0].opts.forceOverrideActive, true, 'the override must be bound');
});

// ── M2-7. 미짝 5종이 전부 도달 가능하고 합계 등식이 성립한다 (DD4) ──────────

test('every one of the five unmatched reasons is reachable, and the sum equation holds', () => {
  const recs = [
    // no_plan_path — 물어볼 키가 없다.
    panelRecord('nopath.md', { slug: 'np', measurement: { plan_path: null } }),
    // key_mismatch — ledger에 같은 plan_file_hash가 있으나 basename이 다르다.
    panelRecord('keymm.md', { slug: 'km' }),
    // anchor_absent — 반대축(ship)이 ship을 증언한다.
    panelRecord('absent.md', { slug: 'ab' }),
    // not_shipped — 증인 4종 전부 no.
    panelRecord('notship.md', { slug: 'ns' }),
    // unclassified — git 증인이 yes지만 자격이 없다.
    panelRecord('unc.md', { slug: 'un' }),
  ];
  const out = aggregate(recs, {
    anchors: anchors({
      ledgerEntries: [
        // km: hash는 같은데 basename이 다르다 -> key_mismatch
        ledgerEntry('other', DAY, { plan_file_hash: 'sha256:km' }),
      ],
      shipReceipts: [shipReceipt('ab', DAY)],
      archived: [],
      implement: [],
      git: { available: true, touched: ['.claude/plans/un.plan.md'] },
    }),
  });
  const u = out.post_panel_span.unmatched.ledger_basename;
  UNMATCHED_REASONS.forEach((r) => {
    assert.equal(u.counts[r], 1, 'reason ' + r + ' must be reachable exactly once here');
  });
  assert.equal(u.sum_equation_holds, true);
  assert.equal(u.total, 5);
  assert.equal(u.by_reason.anchor_absent[0].witness, 'opposite_anchor');
});

test('the closed reason set keeps zero buckets visible — the sum equation needs a denominator', () => {
  const out = aggregate([carrierRecord()], {
    anchors: anchors({ ledgerEntries: [carrierLedger()] }),
  });
  const u = out.post_panel_span.unmatched.ledger_basename;
  // 층화(부재 규칙 c)와 달리 분류는 닫힌 집합이다. 0인 버킷도 키가 남아야
  // `unmatched === Σ(counts)`가 검사 가능하다.
  assert.equal(u.total, 0, 'the carrier joined, so this series has no miss at all');
  assert.deepEqual(Object.keys(u.counts).sort(), UNMATCHED_REASONS.slice().sort());
});

// ── M2-8. `unavailable`은 `no`가 아니다 — 짝 test (DD4·DD15 · R1 F2) ────────

test('an UNAVAILABLE witness blocks not_shipped; flipping only that witness to no reaches it', () => {
  const rec = [panelRecord('a.md', { slug: 'a' }), carrierRecord()];
  const base = {
    ledgerEntries: [carrierLedger()], shipReceipts: [], archived: [], implement: [],
    git: { available: true, touched: [] },
  };

  // (1) implement 소스가 **부재**(§3.12 working-tree only) -> 증인 unavailable.
  const unavail = aggregate(rec, {
    anchors: anchors(Object.assign({}, base, { implementSource: { present: false } })),
  });
  const uA = unavail.post_panel_span.unmatched.ledger_basename;
  assert.equal(uA.counts.unclassified, 1);
  assert.equal(uA.counts.not_shipped, 0,
    '"the witness could not speak" must never be folded into "the witness denied"');
  assert.equal(uA.by_reason.unclassified[0].witnesses.implement_receipt, 'unavailable');

  // (2) 같은 입력에서 그 증인만 읽을 수 있게 바꾼다 -> 만장일치 부정 -> not_shipped.
  const avail = aggregate(rec, { anchors: anchors(base) });
  const uB = avail.post_panel_span.unmatched.ledger_basename;
  assert.equal(uB.counts.not_shipped, 1, 'not_shipped must be REACHABLE, not a dead bucket');
  assert.equal(uB.counts.unclassified, 0);
  WITNESSES.forEach((w) => {
    assert.equal(uB.by_reason.not_shipped[0].witnesses[w], 'no',
      'not_shipped is a unanimous denial by all four witnesses');
  });
});

test('a git witness that could not run is unavailable, never a denial', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' }), carrierRecord()], {
    anchors: anchors({
      ledgerEntries: [carrierLedger()],
      git: { available: false, reason: 'git-exec-failed' },
    }),
  });
  const u = out.post_panel_span.unmatched.ledger_basename;
  assert.equal(u.counts.not_shipped, 0);
  assert.equal(u.by_reason.unclassified[0].witnesses.git_history, 'unavailable');
  assert.equal(out.post_panel_span.coverage.git_witness.available, false);
});

// ── M2-9. 증인은 비대칭이다 — 자격 없는 yes는 ship을 주장하지 못한다 (R1 F1) ─

test('a QUALIFIED ship witness promotes to anchor_absent; an unqualified one never does', () => {
  const rec = [panelRecord('a.md', { slug: 'a' }), carrierRecord()];

  // archived/ 의 plan은 자격이 있다 (§3.11 C2 — PRD 전체 완료 후에만 옮긴다).
  const q = aggregate(rec, {
    anchors: anchors({ ledgerEntries: [carrierLedger()], archived: ['a.plan.md'] }),
  });
  const uq = q.post_panel_span.unmatched.ledger_basename;
  assert.equal(uq.counts.anchor_absent, 1);
  assert.equal(uq.by_reason.anchor_absent[0].witness, 'archived_plan');

  // implement receipt + git touch는 둘 다 yes여도 ship을 증언하지 못한다.
  // 넓혔다면 커밋된 모든 plan이 ship으로 보인다 — F1 권고를 그대로 따랐을 때의 거짓.
  const nq = aggregate(rec, {
    anchors: anchors({
      ledgerEntries: [carrierLedger()],
      implement: ['a'],
      git: { available: true, touched: ['.claude/plans/a.plan.md'] },
    }),
  });
  const unq = nq.post_panel_span.unmatched.ledger_basename;
  assert.equal(unq.counts.anchor_absent, 0, 'implementation ran != it shipped');
  assert.equal(unq.counts.not_shipped, 0, 'a yes also breaks unanimity, so not_shipped is out too');
  assert.equal(unq.counts.unclassified, 1, 'honest: nothing testifies to a ship');
  const w = unq.by_reason.unclassified[0].witnesses;
  assert.equal(w.implement_receipt, 'yes');
  assert.equal(w.git_history, 'yes');
});

// ── M2-10. DD13 — 앵커 소스를 못 읽었으면 사유 분해를 내지 않는다 ───────────

test('a damaged anchor source withholds the reason breakdown and degrades the axis', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({
      ledgerEntries: [ledgerEntry('a', DAY)],
      shipSource: { read_error: true },
    }),
  });
  const s = out.post_panel_span;
  assert.equal(s.state, 'degraded');
  assert.equal('unmatched' in s, false,
    'an empty breakdown is indistinguishable from "classified, found none"');
  // degraded여도 읽힌 것은 보고한다 — 부분 관측을 버리지 않는다(M1 선례).
  assert.equal(s.by_anchor.ledger_basename.n, 1);
  assert.equal(out.state, 'degraded');
});

test('a read_error on the OPPOSITE axis makes its witness unavailable, not a denial', () => {
  // ship 소스만 못 읽었을 때 ledger 축의 미짝이 조용히 not_shipped로 내려가면
  // read_error 강등을 '그 축'에만 건 누수다.
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({ ledgerEntries: [ledgerEntry('a', DAY)], shipSource: { read_error: true } }),
  });
  assert.equal(out.post_panel_span.by_anchor.ship_plan_hash.source_unavailable, true);
});

// ── M2-11. 교차표 · 불일치는 커버리지 차이가 아니다 (Task 3) ────────────────

test('the cross-table partitions every eligible record exactly once', () => {
  const out = aggregate([
    panelRecord('both.md', { slug: 'b' }),
    panelRecord('onlyl.md', { slug: 'l' }),
    panelRecord('onlys.md', { slug: 's' }),
    panelRecord('none.md', { slug: 'n' }),
  ], {
    anchors: anchors({
      ledgerEntries: [ledgerEntry('b', DAY), ledgerEntry('l', DAY)],
      shipReceipts: [shipReceipt('b', 2 * DAY), shipReceipt('s', 2 * DAY)],
    }),
  });
  const c = out.post_panel_span.coverage;
  assert.equal(c.both + c.only_ledger + c.only_ship + c.neither, c.eligible);
  assert.equal(c.both, 1);
  assert.equal(c.only_ledger, 1);
  assert.equal(c.only_ship, 1);
  assert.equal(c.neither, 1);
});

test('disagreement counts ONLY records matched on both axes — single-axis records are coverage', () => {
  const out = aggregate([
    panelRecord('both.md', { slug: 'b' }),
    panelRecord('onlyl.md', { slug: 'l' }),
  ], {
    anchors: anchors({
      ledgerEntries: [ledgerEntry('b', DAY), ledgerEntry('l', DAY)],
      shipReceipts: [shipReceipt('b', 3 * DAY)],
    }),
  });
  const s = out.post_panel_span;
  // 앞의 항등식은 두 불리언 분할이라 구성상 항상 참이다. 실제 결함(단일 앵커
  // 레코드가 불일치로 계수됨)을 잡는 것은 아래 두 단언이다.
  assert.equal(s.disagreement.n, out.post_panel_span.coverage.both);
  const names = s.disagreement.records.map((r) => r.record);
  assert.deepEqual(names, ['both.md']);
  assert.equal(names.includes('onlyl.md'), false,
    'a record matched on ONE axis is a coverage difference, never a disagreement');
  assert.equal(s.disagreement.records[0].anchor_delta_ms, 2 * DAY);
});

// ── M2-12. state ladder · 부재 규칙 · 합성 (Task 4) ─────────────────────────

test('a blind post_panel_span never suppresses the panel_span distribution', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], { anchors: anchors({}) });
  assert.equal('post_panel_span' in out, false, 'no observation and no damage -> no key');
  assert.equal(out.panel_span.n, 1, 'one axis being blind must not suppress the other');
  assert.equal(out.state, 'ok');
});

test('the M1 fixtures keep their verdicts — no anchors injected means no M2 axis (DD12)', () => {
  const out = aggregate([record({ name: 'a.md' })]);
  assert.equal('post_panel_span' in out, false);
  assert.equal(out.state, 'ok');
  assert.equal(out.state_is_composite, true);
});

test('a damaged anchor source loads the axis EVEN WITH zero observations (H7 fail-open)', () => {
  // 키를 지우면 합성에서 빠져 최상위가 ok로 남는다 — 그것이 fail-open이다.
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({ ledgerSource: { read_error: true }, shipSource: { read_error: true } }),
  });
  assert.equal(out.post_panel_span.state, 'degraded');
  assert.equal(out.post_panel_span.by_anchor, undefined, 'state only — no distribution to report');
  assert.equal(out.state, 'degraded');
  assert.equal(exitCodeForState(out.state), 1);
});

test('damaged-first applies to panel_span too — a read error keeps its axis loaded', () => {
  // M1 코드는 damaged여도 관측 0건이면 축 키를 만들지 않고 early return했다.
  // 그대로 두면 실린 축이 0개가 되어 최상위가 blind로 접히고, 오늘 degraded로
  // 보고되는 상황이 관측 부재로 강등된다.
  const out = aggregate([], { readError: true });
  assert.equal(out.panel_span.state, 'degraded');
  assert.equal(out.state, 'degraded');
  assert.equal(exitCodeForState(out.state), 1);
});

test('with no axis loaded at all the composite is undefined, so it is blind (exit 2)', () => {
  const out = aggregate([]);
  assert.equal('panel_span' in out, false);
  assert.equal('post_panel_span' in out, false);
  assert.equal(out.state, 'blind');
  assert.equal(exitCodeForState(out.state), 2);
});

test('one degraded axis makes the composite degraded even when the other is ok', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({ ledgerEntries: [ledgerEntry('a', -DAY)] }),
  });
  assert.equal(out.panel_span.state, 'ok');
  assert.equal(out.post_panel_span.state, 'degraded', 'negative span degrades its own axis');
  assert.equal(out.state, 'degraded');
  assert.equal(exitCodeForState(out.state), 1);
});

test('compositeState takes the worst of the LOADED axes only', () => {
  assert.equal(compositeState([]), 'blind', 'no loaded axis -> the composite is undefined');
  assert.equal(compositeState(['ok']), 'ok');
  assert.equal(compositeState(['ok', 'degraded']), 'degraded');
  assert.equal(compositeState(['degraded', 'ok']), 'degraded');
});

// ── M2-13. 부재 규칙 — 패널 시각이 없으면 미짝으로 접지 않고 이름을 남긴다 ──

test('a record with no panel timestamp is named, not folded into an unmatched reason', () => {
  const out = aggregate([
    panelRecord('a.md', { slug: 'a' }),
    panelRecord('nots.md', { slug: 'x', measurement: { recorded_at: null } }),
  ], { anchors: anchors({ ledgerEntries: [ledgerEntry('a', DAY)] }) });
  const c = out.post_panel_span.coverage;
  assert.equal(c.eligible, 1, 'a record with no panel end cannot have a span at all');
  assert.equal(c.no_panel_timestamp, 1);
  assert.deepEqual(c.no_panel_timestamp_records, ['nots.md']);
  const u = out.post_panel_span.unmatched.ledger_basename;
  assert.equal(u.total, 0, 'it is excluded from the denominator, not classified as a miss');
});

// ── M2-14. 사람이 읽는 출력에 커버리지가 값보다 먼저 나온다 (UI3) ───────────

test('the rendered M2 output states coverage and marks the composite as composite', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({ ledgerEntries: [ledgerEntry('a', DAY)] }),
  });
  const text = renderHuman(out);
  assert.match(text, /state above is COMPOSITE/);
  const covIdx = text.indexOf('coverage: eligible');
  const valIdx = text.indexOf('ledger_basename (nearest-rank');
  assert.ok(covIdx !== -1 && valIdx !== -1);
  assert.ok(covIdx < valIdx, 'coverage must precede the value, or a lower bound reads as a census');
  // 필터 근거는 0건일 때도 반드시 보인다 — 안 보이면 필터가 켜져 있는지 알 수 없다.
  assert.match(text, /ship receipts: 0\/0 qualified \(unproven-skip 0 · override-qualified 0\)/);
});

test('a zero-join series says so instead of silently omitting itself', () => {
  const out = aggregate([panelRecord('a.md', { slug: 'a' })], {
    anchors: anchors({ ledgerEntries: [ledgerEntry('a', DAY)] }),
  });
  const text = renderHuman(out);
  assert.match(text, /ship_plan_hash: n=0 \(no join — absence is not a value of zero\)/);
});
