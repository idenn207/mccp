'use strict';

// diverse-agent-review M8 Task 2 — plan-review 코퍼스 집계 오라클 회귀 test.
//
// 이 test가 고정하는 것은 **파서와 분류 규칙**이다. 실코퍼스에 대한 경험적 주장
// (DN4·DN5·DN7)은 픽스처로 증명되지 않는다 — 그 반증은 도구를 실제 코퍼스에
// 돌린 출력을 문서에 축자 동결하는 것으로 성립한다(plan L2 test/HIGH `22e3dcb0`
// 흡수: 여기서 주장하지 않고 그 한계를 명시한다).
//
// 특히 지키는 것 셋:
//   - 부재를 0으로 접지 않는다 (blind · unknown · pre_measurement).
//   - `record.js#cell`의 이스케이프 역변환 순서.
//   - F6 축의 소스가 Refutation 표라는 것 (Findings의 합성 행이 아니다).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseRecord,
  aggregate,
  splitRow,
  classifyBinding,
  classifyF6,
} = require('../plan-review/corpus');

// ── 픽스처 빌더 ───────────────────────────────────────────────────────────────

function record(opts) {
  const o = opts || {};
  const measurement = Object.assign({
    verdict: 'divergent',
    source: 'multi-agent',
    layers: { l1: 'converged', l2: 'divergent', l3: 'not fired' },
    quorum: { responded: 4, required: 3, roles: 4, of: 4, passed: false },
    wall_clock_ms: 123456,
    halt_stage: null,
    reviewed_plan_hash: 'sha256:deadbeef',
    plan_path: '.claude/plans/x.plan.md',
    recorded_at: '2026-08-22T00:00:00.000Z',
  }, o.measurement || {});
  if (o.measurement && Object.prototype.hasOwnProperty.call(o.measurement, 'quorum')) {
    measurement.quorum = o.measurement.quorum;
  }

  const L = [];
  L.push(o.title === undefined ? '# Plan Review Panel — fixture' : o.title);
  L.push('');
  L.push('**Verdict**: `' + measurement.verdict + '` via `multi-agent`');
  L.push('');
  if (o.reason !== null) {
    L.push('> Reason: ' + (o.reason || '3 blocking finding(s): test/HIGH'));
    L.push('');
  }
  L.push('## Findings');
  L.push('');
  const findings = o.findings || [];
  if (findings.length) {
    L.push('| Perspective | Severity | Claim | Evidence |');
    L.push('|---|---|---|---|');
    findings.forEach(function (f) {
      L.push('| ' + f[0] + ' | ' + f[1] + ' | ' + (f[2] || 'claim') + ' | ' + (f[3] || 'ev') + ' |');
    });
  } else {
    L.push('None recorded.');
  }
  L.push('');
  L.push('## Refutation attempted');
  L.push('');
  const refutation = o.refutation || [];
  if (refutation.length) {
    L.push('| Perspective | Verdict | What was attacked |');
    L.push('|---|---|---|');
    refutation.forEach(function (r) {
      L.push('| ' + r[0] + ' | ' + r[1] + ' | attacked things |');
    });
  } else {
    L.push('No reviewer result reached this record.');
  }
  L.push('');
  if (o.omitMeasurement) return L.join('\n');
  L.push('## Measurement');
  L.push('');
  L.push('```json');
  L.push(o.rawMeasurement !== undefined ? o.rawMeasurement : JSON.stringify(measurement, null, 2));
  L.push('```');
  L.push('');
  return L.join('\n');
}

function wrap(name, text) { return { name: name, text: text }; }

const SPLIT_MS = Date.parse('2026-08-20T16:36:03.000Z');
function agg(records, extra) {
  return aggregate(records, Object.assign({ kSplitAtMs: SPLIT_MS, kSplitRef: 'abc1234' }, extra || {}));
}

// ── (1) 정상 레코드: 3표가 모두 잡힌다 ────────────────────────────────────────

test('parseRecord captures Measurement, Findings and Refutation from a normal record', function () {
  const p = parseRecord(record({
    findings: [['architect', 'HIGH'], ['test', 'MEDIUM']],
    refutation: [['architect', 'fail'], ['test', 'pass']],
  }));
  assert.equal(p.ok, true);
  assert.equal(p.kind, 'record');
  assert.equal(p.measurement.verdict, 'divergent');
  assert.equal(p.measurement.quorum.required, 3);
  assert.equal(p.findings.length, 2);
  assert.deepEqual(p.findings[0], {
    perspective: 'architect', severity: 'HIGH', claim: 'claim', evidence: 'ev',
  });
  assert.equal(p.refutation.length, 2);
  assert.equal(p.refutation[1].verdict, 'pass');
  assert.equal(p.sections.findings, true);
  assert.equal(p.sections.refutation, true);
});

// ── (2) quorum null / required null 이 크래시 없이 별도 분류로 ────────────────

test('a record whose quorum is null (L1 halt) parses and lands outside the M/K denominator', function () {
  const l1Halt = record({
    measurement: { quorum: null, layers: { l1: 'divergent', l2: 'not run', l3: 'not fired' } },
    reason: 'L1 found 1 violation(s): C1_CREATE_EXISTS — target already exists. L2 was not fired.',
    findings: [],
    refutation: [],
  });
  const p = parseRecord(l1Halt);
  assert.equal(p.ok, true);
  assert.equal(p.measurement.quorum, null);

  const r = agg([wrap('l1.md', l1Halt)]);
  assert.equal(r.state, 'ok');
  assert.equal(r.binding_axis.blocked_records, 1);
  assert.equal(r.binding_axis.l2_not_evaluated, 1);
  // 질문이 성립하지 않은 레코드는 M·K 모수에 들어가지 않는다.
  assert.equal(r.binding_axis.quorum_evaluated_blocked, 0);
  assert.equal(r.binding_axis.unknown, 1);
  assert.deepEqual(r.binding_axis.unknown_records, ['l1.md']);
});

test('a record whose quorum.required is null does not crash and yields no M cross-check conflict', function () {
  const budgetHalt = record({
    measurement: {
      verdict: 'unknown',
      quorum: { responded: 4, required: null, roles: 4, of: null, passed: null },
    },
    reason: 'panel budget exhausted before decide',
  });
  const p = parseRecord(budgetHalt);
  assert.equal(p.ok, true);
  const c = classifyBinding(p);
  assert.equal(c.readable, true);
  assert.equal(c.conflict, null);          // required가 null이면 대조하지 않는다
  const r = agg([wrap('budget.md', budgetHalt)]);
  assert.equal(r.binding_axis.unknown, 1);
  assert.equal(r.binding_axis.quorum_evaluated_blocked, 0);
});

// ── (3) blind 규칙: 0건에서 어떤 비율도 내지 않는다 ───────────────────────────

test('an empty corpus is blind and reports NO ratio keys at all', function () {
  const r = agg([]);
  assert.equal(r.state, 'blind');
  assert.equal(r.records, 0);
  // 축 키 자체가 없어야 한다 — 0으로 실으면 "관측했더니 0"으로 읽힌다 (DN3).
  assert.equal(r.pass_path, undefined);
  assert.equal(r.binding_axis, undefined);
  assert.equal(r.f6, undefined);
  assert.equal(r.verdicts, undefined);
  assert.equal(r.perspectives, undefined);
});

test('a corpus of only out-of-corpus files is blind, not ok', function () {
  const r = agg([wrap('pr-1.md', '# PR Review: #1 — x\n\nbody\n')]);
  assert.equal(r.state, 'blind');
  assert.equal(r.out_of_corpus, 1);
  assert.equal(r.pass_path, undefined);
});

// ── (4) binding_axis: 세 축이 각각 정확히 분류된다 ────────────────────────────

test('binding_axis classifies M-short, K-short and blocking-only records independently', function () {
  const mShort = record({
    measurement: { quorum: { responded: 2, required: 3, roles: 2, of: 4, passed: false } },
    reason: 'L2 quorum not satisfied: only 2 of 3 required responses',
  });
  const kShort = record({
    measurement: { quorum: { responded: 4, required: 3, roles: 1, of: 4, passed: false } },
    reason: 'L2 quorum not satisfied: only 1 distinct role(s), need 3',
  });
  const blockingOnly = record({
    reason: 'L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, invariant/FAIL',
  });

  const r = agg([wrap('m.md', mShort), wrap('k.md', kShort), wrap('f.md', blockingOnly)]);
  assert.equal(r.binding_axis.blocked_records, 3);
  assert.equal(r.binding_axis.quorum_evaluated_blocked, 3);
  assert.equal(r.binding_axis.m_binding, 1);
  assert.equal(r.binding_axis.k_binding, 1);
  assert.equal(r.binding_axis.findings_binding, 1);
  assert.equal(r.binding_axis.unknown, 0);
  assert.deepEqual(r.binding_axis.cross_check_conflicts, []);
});

test('binding_axis counts a record that is bound on several axes once per axis', function () {
  const both = record({
    measurement: { quorum: { responded: 2, required: 3, roles: 1, of: 4, passed: false } },
    reason: 'L2 quorum not satisfied: only 2 of 3 required responses; only 1 distinct role(s), ' +
      'need 3; 2 blocking finding(s): test/HIGH',
  });
  const r = agg([wrap('both.md', both)]);
  assert.equal(r.binding_axis.quorum_evaluated_blocked, 1);
  assert.equal(r.binding_axis.m_binding, 1);
  assert.equal(r.binding_axis.k_binding, 1);
  assert.equal(r.binding_axis.findings_binding, 1);
});

test('a blocked record with NO reason line is unknown, never a zero on any axis', function () {
  const noReason = record({ reason: null });
  const r = agg([wrap('mute.md', noReason)]);
  assert.equal(r.binding_axis.unknown, 1);
  assert.deepEqual(r.binding_axis.unknown_records, ['mute.md']);
  assert.equal(r.binding_axis.m_binding, 0);
  assert.equal(r.binding_axis.k_binding, 0);
  assert.equal(r.binding_axis.quorum_evaluated_blocked, 0);
});

test('a reason that disagrees with measurement.quorum on the M axis surfaces as a conflict', function () {
  const conflicting = record({
    measurement: { quorum: { responded: 2, required: 3, roles: 4, of: 4, passed: false } },
    reason: 'L2 quorum not satisfied: 3 blocking finding(s): test/HIGH',  // M 미언급
  });
  const r = agg([wrap('conflict.md', conflicting)]);
  assert.equal(r.binding_axis.cross_check_conflicts.length, 1);
  assert.equal(r.binding_axis.cross_check_conflicts[0].record, 'conflict.md');
  assert.match(r.binding_axis.cross_check_conflicts[0].detail, /responded\(2\) < required\(3\)/);
});

// ── (5) f6: Refutation 표가 소스다 ────────────────────────────────────────────

test('a failing reviewer whose findings are all MEDIUM is an F6-solo reviewer', function () {
  const p = parseRecord(record({
    findings: [['security', 'MEDIUM'], ['security', 'LOW']],
    refutation: [['security', 'fail'], ['architect', 'pass']],
  }));
  const c = classifyF6(p);
  assert.equal(c.fail_reviewers, 1);
  assert.equal(c.solo_fail_reviewers, 1);
  assert.deepEqual(c.solo_fail_perspectives, ['security']);
  assert.equal(c.real_blocking_findings, 0);
  assert.equal(c.record_flipped_by_f6, true);
});

test('a failing reviewer that filed a HIGH is NOT an F6-solo reviewer', function () {
  const p = parseRecord(record({
    findings: [['security', 'HIGH']],
    refutation: [['security', 'fail']],
  }));
  const c = classifyF6(p);
  assert.equal(c.fail_reviewers, 1);
  assert.equal(c.solo_fail_reviewers, 0);
  assert.equal(c.real_blocking_findings, 1);
  assert.equal(c.record_flipped_by_f6, false);
});

// 이 test가 M8 구현의 실제 결함을 잡았다: 초판은 `## Findings`의 합성 `FAIL` 행만
// 세었는데 record.js#findingRows는 finding이 0건일 때만 그 행을 쓴다. MEDIUM만
// 낸 실패 리뷰어는 그래서 구조적으로 관측되지 않았고 F6 기여도가 항상 0으로
// 보고됐다(실코퍼스 합성 행 0건).
test('F6 is read from the Refutation table, not from synthetic FAIL rows in Findings', function () {
  const text = record({
    findings: [['security', 'MEDIUM']],       // 합성 FAIL 행이 없다
    refutation: [['security', 'fail']],
  });
  assert.equal(/\| FAIL \|/.test(text), false, 'fixture must contain no synthetic FAIL row');
  const c = classifyF6(parseRecord(text));
  assert.equal(c.solo_fail_reviewers, 1);
});

test('an unrecognised severity counts as blocking, mirroring quorum.js', function () {
  const c = classifyF6(parseRecord(record({
    findings: [['test', 'WEIRD']],
    refutation: [['test', 'fail']],
  })));
  assert.equal(c.real_blocking_findings, 1);
  assert.equal(c.solo_fail_reviewers, 0);
  assert.equal(c.record_flipped_by_f6, false);
});

test('a record with no refutation table falls back to synthetic FAIL rows', function () {
  const c = classifyF6(parseRecord(record({
    findings: [['invariant', 'FAIL', 'reviewer returned verdict=fail']],
    refutation: [],
  })));
  assert.equal(c.fail_reviewers, 1);
  assert.equal(c.solo_fail_reviewers, 1);
  assert.equal(c.record_flipped_by_f6, true);
});

test('f6 aggregate names the records it counts', function () {
  const solo = record({
    findings: [['security', 'MEDIUM']],
    refutation: [['security', 'fail']],
  });
  const real = record({
    findings: [['test', 'CRITICAL']],
    refutation: [['test', 'fail']],
  });
  const r = agg([wrap('solo.md', solo), wrap('real.md', real)]);
  assert.equal(r.f6.fail_reviewer_instances, 2);
  assert.equal(r.f6.solo_fail_reviewer_instances, 1);
  assert.equal(r.f6.records_flipped_if_f6_removed, 1);
  assert.deepEqual(r.f6.flipped_records, ['solo.md']);
  assert.deepEqual(r.f6.solo_fail_records, [{ record: 'solo.md', perspectives: ['security'] }]);
  // 히스토그램은 의도적으로 null-prototype이다 (severity 문자열이 마크다운에서
  // 오므로 `__proto__` 같은 키가 살아 있는 슬롯이 되면 안 된다). 값만 비교한다.
  assert.equal(Object.getPrototypeOf(r.f6.severity_histogram), null);
  assert.deepEqual(
    Object.assign({}, r.f6.severity_histogram),
    { MEDIUM: 1, CRITICAL: 1 },
  );
});

// ── (6) 파싱 실패는 조용히 0으로 세어지지 않는다 ──────────────────────────────

test('a panel record with a broken Measurement JSON degrades and is named', function () {
  const broken = record({ rawMeasurement: '{ "verdict": "converged", ' });
  const r = agg([wrap('broken.md', broken)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.records, 0);
  assert.equal(r.parse_failures, 1);
  assert.equal(r.parse_errors.length, 1);
  assert.equal(r.parse_errors[0].record, 'broken.md');
  assert.match(r.parse_errors[0].error, /parse failed/);
});

test('one broken record among good ones degrades the whole run — counts are a lower bound', function () {
  const good = record({ refutation: [['architect', 'pass']] });
  const broken = record({ rawMeasurement: 'not json at all' });
  const r = agg([wrap('good.md', good), wrap('broken.md', broken)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.records, 1);
  assert.equal(r.parse_failures, 1);
  assert.equal(r.coverage.counts_are_lower_bound, true);
});

// ── (7) 3번째 셀의 파이프가 열을 어긋내지 않는다 ──────────────────────────────

test('splitRow honours record.js#cell escaping and reverses it in the right order', function () {
  // record.js#cell: 백슬래시 먼저, 파이프 나중 → 역변환은 파이프 먼저.
  assert.deepEqual(splitRow('| a | b\\|c | d |'), ['a', 'b|c', 'd']);
  assert.deepEqual(splitRow('| a | b\\\\c | d |'), ['a', 'b\\c', 'd']);
  // 리터럴 백슬래시 + 진짜 구분자. 역변환 순서를 뒤집으면 이 케이스가 깨진다.
  assert.deepEqual(splitRow('| a\\\\ | b |'), ['a\\', 'b']);
});

test('a pipe inside the Claim cell does not shift the Severity or Evidence columns', function () {
  const p = parseRecord(record({
    findings: [['invariant', 'HIGH', 'regex /a\\|b/ matches', 'quorum.js:189 uses a\\|b']],
    refutation: [['invariant', 'fail']],
  }));
  assert.equal(p.findings.length, 1);
  assert.equal(p.findings[0].perspective, 'invariant');
  assert.equal(p.findings[0].severity, 'HIGH');
  assert.equal(p.findings[0].claim, 'regex /a|b/ matches');
  assert.equal(p.findings[0].evidence, 'quorum.js:189 uses a|b');
  // 열이 어긋났다면 severity가 'HIGH'가 아니게 된다 — F6 분류가 조용히 틀어진다.
  assert.equal(classifyF6(p).real_blocking_findings, 1);
});

// ── 코퍼스 경계 ───────────────────────────────────────────────────────────────

test('a non-panel document is out_of_corpus and does NOT degrade the run', function () {
  const good = record({ refutation: [['architect', 'pass']] });
  const r = agg([
    wrap('good.md', good),
    wrap('pr-88-review.md', '# PR Review: #88 — x\n\n## Findings\n\nnone\n'),
    wrap('santa.md', '# santa-loop review — y\n\nbody\n'),
  ]);
  assert.equal(r.state, 'ok');
  assert.equal(r.records, 1);
  assert.equal(r.out_of_corpus, 2);
  assert.equal(r.parse_failures, 0);
  assert.equal(r.coverage.panel_records, 1);
  assert.equal(r.coverage.counts_are_lower_bound, false);
});

test('a pre-Measurement panel record is named and lowers coverage without degrading', function () {
  const good = record({ refutation: [['architect', 'pass']] });
  const old = record({ omitMeasurement: true });
  const r = agg([wrap('good.md', good), wrap('old.md', old)]);
  assert.equal(r.state, 'ok');            // 상시 degraded는 신호를 죽인다
  assert.equal(r.records, 1);
  assert.equal(r.pre_measurement, 1);
  assert.deepEqual(r.pre_measurement_records, ['old.md']);
  assert.equal(r.coverage.panel_records, 2);
  assert.equal(r.coverage.measurable, 1);
  assert.equal(r.coverage.unmeasurable, 1);
  assert.equal(r.coverage.counts_are_lower_bound, true);
});

// ── pass_path (UI9) ───────────────────────────────────────────────────────────

test('pass_path separates hash binding and single-pass taint per converged record', function () {
  const clean = record({
    measurement: { verdict: 'converged', wall_clock_ms: 1000 },
    reason: 'L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired',
    refutation: [['architect', 'pass']],
  });
  const tainted = record({
    measurement: { verdict: 'converged', wall_clock_ms: 2000, reviewed_plan_hash: null },
    reason: 'L2 quorum not satisfied: 2 blocking finding(s) — MCCP_REVIEW_SINGLE_PASS=deadline_pressure',
    refutation: [['test', 'fail']],
  });
  const r = agg([wrap('clean.md', clean), wrap('tainted.md', tainted)]);
  assert.equal(r.pass_path.count, 2);
  assert.equal(r.pass_path.hash_bound, 1);
  assert.equal(r.pass_path.single_pass_tainted, 1);
  assert.deepEqual(r.pass_path.wall_clock_ms_observed, [1000, 2000]);
});

test('a converged record with an unmeasured wall clock is omitted from the observed list, not zeroed', function () {
  const r = agg([wrap('c.md', record({
    measurement: { verdict: 'converged', wall_clock_ms: null },
    refutation: [['architect', 'pass']],
  }))]);
  assert.deepEqual(r.pass_path.wall_clock_ms_observed, []);
  assert.equal(r.pass_path.entries[0].wall_clock_ms, null);
});

// ── single_pass — 구조적 0을 관측으로 착각하지 않는다 ─────────────────────────
//
// 이 세 test가 잡는 실제 결함: 초판은 완화 카운트를 `pass_path` 안에만 두었는데
// 그 필드는 converged 만 필터한다. `decide.js:338`은 완화를 언제나 `'divergent'`로
// 봉인하므로 그 값은 어떤 코퍼스에서도 0이고, 실코퍼스의 완화 14건이 출력 어디에도
// 나타나지 않았다. F6과 같은 형태의 오류다 — 잘못된 소스에서 얻은 구조적 0.

test('single_pass counts relaxed runs regardless of verdict — the real shape decide.js produces', function () {
  // decide.js:338 이 만드는 실제 형태: 완화는 divergent 로 봉인된다.
  const relaxed = record({
    measurement: { verdict: 'divergent' },
    reason: 'L2 quorum not satisfied: 2 blocking finding(s): test/HIGH — ' +
      'MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.',
    refutation: [['test', 'fail']],
  });
  const plain = record({ refutation: [['architect', 'fail']] });

  const r = agg([wrap('relaxed.md', relaxed), wrap('plain.md', plain)]);
  assert.equal(r.single_pass.records, 1);
  assert.equal(r.single_pass.blocked, 1);
  assert.equal(r.single_pass.converged, 0);
  assert.deepEqual(r.single_pass.record_names, ['relaxed.md']);
  // 회귀의 핵심: converged-only 축은 여기서 0이다. 그 0만 읽으면 완화가 없다고
  // 읽히는데, 실제로는 1건 있었다.
  assert.equal(r.pass_path.single_pass_tainted, 0);
});

test('pass_path.single_pass_tainted is a regression guard, not an observation of zero', function () {
  // 이 픽스처는 decide.js 가 만들 수 없는 형태다(완화 + converged). 그 봉인이
  // 깨지는 날 이 축이 0을 벗어나야 한다 — 그래서 필드를 지우지 않고 남긴다.
  const impossible = record({
    measurement: { verdict: 'converged' },
    reason: 'MCCP_REVIEW_SINGLE_PASS=scope_too_small',
    refutation: [['architect', 'pass']],
  });
  const r = agg([wrap('impossible.md', impossible)]);
  assert.equal(r.pass_path.single_pass_tainted, 1);
  // 같은 레코드가 verdict 무관 축에도 잡힌다 — 두 축은 배타가 아니라 포함이다.
  assert.equal(r.single_pass.records, 1);
  assert.equal(r.single_pass.converged, 1);
});

test('an empty corpus reports no single_pass key either — absence is not a count of zero', function () {
  const r = agg([]);
  assert.equal(r.state, 'blind');
  assert.equal(r.single_pass, undefined);
});

// ── k_split (DN5) ─────────────────────────────────────────────────────────────

test('k_split buckets records around the split instant and counts converged in each', function () {
  const before = record({
    measurement: { verdict: 'converged', recorded_at: '2026-08-01T00:00:00.000Z' },
    refutation: [['architect', 'pass']],
  });
  const after = record({
    measurement: { verdict: 'divergent', recorded_at: '2026-08-25T00:00:00.000Z' },
    refutation: [['architect', 'fail']],
  });
  const r = agg([wrap('b.md', before), wrap('a.md', after)]);
  assert.equal(r.k_split.state, 'ok');
  assert.deepEqual(r.k_split.before, { records: 1, converged: 1 });
  assert.deepEqual(r.k_split.after, { records: 1, converged: 0 });
  assert.equal(r.k_split.undated, 0);
});

test('a record with an unparsable recorded_at is undated, not silently bucketed', function () {
  const r = agg([wrap('u.md', record({
    measurement: { recorded_at: 'not-a-date' },
    refutation: [['architect', 'fail']],
  }))]);
  assert.equal(r.k_split.undated, 1);
  assert.equal(r.k_split.before.records, 0);
  assert.equal(r.k_split.after.records, 0);
});

test('an unresolvable split ref yields state=unresolved and no buckets — never a default split', function () {
  const r = aggregate([wrap('x.md', record({ refutation: [['architect', 'fail']] }))], {
    kSplitAtMs: null,
    kSplitRef: 'nope',
    kSplitError: 'git show failed',
  });
  assert.equal(r.k_split.state, 'unresolved');
  assert.equal(r.k_split.ref, 'nope');
  assert.equal(r.k_split.before, undefined);
  assert.equal(r.k_split.after, undefined);
  assert.match(r.k_split.reason, /git show failed/);
});

// ── perspectives ──────────────────────────────────────────────────────────────

test('perspectives tallies pass/fail per role across records', function () {
  const a = record({ refutation: [['architect', 'pass'], ['test', 'fail']] });
  const b = record({ refutation: [['architect', 'fail'], ['test', 'fail']] });
  const r = agg([wrap('a.md', a), wrap('b.md', b)]);
  assert.deepEqual(r.perspectives.architect, { pass: 1, fail: 1, other: 0, total: 2 });
  assert.deepEqual(r.perspectives.test, { pass: 0, fail: 2, other: 0, total: 2 });
});

// ── read error ────────────────────────────────────────────────────────────────

test('a hard read error degrades even when every parsed record is clean', function () {
  const r = agg([wrap('good.md', record({ refutation: [['architect', 'pass']] }))], {
    readError: true,
  });
  assert.equal(r.state, 'degraded');
  assert.equal(r.read_error, true);
  assert.equal(r.records, 1);
});

test('a hard read error on an empty corpus reports degraded, not blind', function () {
  const r = agg([], { readError: true });
  assert.equal(r.state, 'degraded');
});

// ── 임계값 부재 (DN11 · UI11) ─────────────────────────────────────────────────

test('the aggregate output carries no threshold, target or pass/fail judgement', function () {
  const r = agg([wrap('a.md', record({ refutation: [['architect', 'fail']] }))]);
  const keys = JSON.stringify(r);
  assert.equal(/threshold|target|acceptable|approval_rate|"passed_overall"/i.test(keys), false);
});
