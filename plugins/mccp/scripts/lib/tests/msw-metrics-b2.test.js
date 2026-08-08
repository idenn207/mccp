'use strict';

// multi-session-work-loop M3 — B2 강등 해제 회귀.
//
// 고정하는 계약:
//   gate 미통과 → forward-only 유지 (가장 중요 — 통과하면 gate가 실효)
//   producer 부재 → forward-only
//   gate 통과 + 충돌 0 → computed 0 (정당한 computed-zero가 도달 가능해야 한다)
//   분모 0 → invalid (무결성 규칙)
//   prevented가 분자에 섞이지 않음 (역인센티브 제거)

const test = require('node:test');
const assert = require('node:assert');

const { computeMetrics } = require('../msw-metrics');
const { buildSeededModel } = require('../msw-metrics/fixture');

function modelWith(overrides) {
  const m = buildSeededModel();
  Object.assign(m.sources.session_activity, overrides || {});
  return m;
}

function b2(overrides) {
  return computeMetrics(modelWith(overrides)).B2;
}

test('gate passed + producer present + zero incidents → computed 0 (not forward-only)', () => {
  // This is the whole point of M3: a wired producer observing zero overwrites
  // across N concurrent pairs must be able to report a legitimate computed zero.
  const r = b2({});
  assert.equal(r.status, 'computed');
  assert.equal(r.numerator, 0);
  assert.equal(r.denominator, 1);
  assert.equal(r.value, 0);
  assert.equal(r.integrity_ok, true);
});

test('coverage gate NOT passed → stays forward-only (gate is load-bearing)', () => {
  const r = b2({ coverage_gate_ok: false });
  assert.equal(r.status, 'forward-only', 'an unproven coverage claim must not flip B2');
  assert.equal(r.numerator, null, 'no numerator may be claimed');
  assert.match(r.invalid_reason, /coverage gate/);
});

test('collision producer absent → stays forward-only', () => {
  const r = b2({ collision_producer_present: false });
  assert.equal(r.status, 'forward-only');
  assert.equal(r.numerator, null);
  assert.match(r.invalid_reason, /guard_active/);
});

test('producer presence is INDEPENDENT of incident count (M2 requirement)', () => {
  // Deriving presence from observed collisions would make computed-zero
  // unreachable. Zero incidents with presence=true must still compute.
  const zero = b2({ overwrite_observed_count: 0 });
  assert.equal(zero.status, 'computed');
  assert.equal(zero.value, 0);

  const some = b2({ overwrite_observed_count: 3, concurrent_pairs_count: 6 });
  assert.equal(some.status, 'computed');
  assert.equal(some.value, 0.5);
});

test('denominator zero → invalid (a rate cannot be manufactured)', () => {
  const r = b2({ concurrent_pairs_count: 0 });
  assert.equal(r.status, 'invalid');
  assert.equal(r.integrity_ok, false);
  assert.equal(r.value, null);
  assert.match(r.invalid_reason, /denominator is zero/);
});

test('prevented conflicts are co-reported but NEVER in the numerator', () => {
  // Counting blocked races as incidents makes the metric worse the better the
  // defense works — the exact perverse incentive the design forbids.
  const r = b2({ conflict_prevented_count: 9, overwrite_observed_count: 0 });
  assert.equal(r.numerator, 0, 'prevented must not inflate the numerator');
  assert.equal(r.conflicts_prevented, 9, 'but it IS surfaced');
  assert.equal(r.value, 0);
});

test('prevented is surfaced even while B2 is forward-only', () => {
  const r = b2({ coverage_gate_ok: false, conflict_prevented_count: 4 });
  assert.equal(r.status, 'forward-only');
  assert.equal(r.conflicts_prevented, 4);
});

test('source unavailable → insufficient (unchanged contract)', () => {
  const m = buildSeededModel();
  m.sources.session_activity = { ok: false };
  const r = computeMetrics(m).B2;
  assert.equal(r.status, 'insufficient');
});

test('B2 is claimed-computable: the fixture must satisfy the metrics-assert checks', () => {
  // Mirrors derive/cli.js metrics-assert Check 1-3 for B2 so the CLI gate and
  // this test cannot drift apart.
  const r = b2({});
  assert.ok(r, 'B2 present in metrics');
  assert.notEqual(r.numerator, null);
  assert.notEqual(r.denominator, null);
  assert.notEqual(r.status, 'baseline-forming');
});
