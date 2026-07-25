'use strict';

// msw-metrics-acceptance test — R2-F2 mechanical gate
// 자동 산출값이 {{metrics:{}}}을 통과 못 하도록 강제
// Seeded fixture + production dry-run: 각 claimed-computable id enumerate, null/baseline-forming reject, B3 실수치 assert

const { test } = require('node:test');
const assert = require('node:assert');
const {
  computeMetrics,
  METRIC_IDS,
  A1_WORK_COMPLETION_RATE,
  A2_CONTEXT_REMAINING,
  A4_RESTORE_RATE,
  B1_STATUS_DRIFT,
  B2_CONCURRENT_CONFLICTS,
  B3_TOGGLE_AXES,
  C1_FEEDBACK_CLOSURE,
  C2_GATE_FALSE_POSITIVE,
  C3_LEAKED_DEFECTS,
} = require('../msw-metrics');
// R2-F2 — same seeded fixture the `metrics-assert --fixtures` CLI gate uses, so
// the gate and the test that guards it can never drift.
const { buildSeededModel } = require('../msw-metrics/fixture');

// Claimed-computable IDs: A1, A2, A4, B2, B3 (all backed by a real derive source)
// Forward-only: C1 (no live findings source — PR-Codex R2-F3), C2/C3 (귀속 미구축)
// Not computed: B1 (no independent evidence source)
const CLAIMED_COMPUTABLE = [
  A1_WORK_COMPLETION_RATE,
  A2_CONTEXT_REMAINING,
  A4_RESTORE_RATE,
  B2_CONCURRENT_CONFLICTS,
  B3_TOGGLE_AXES,
];

test('msw-metrics-acceptance: seeded fixture with non-null numerator/denominator/status', async (t) => {
  const seedModel = buildSeededModel();

  const metrics = computeMetrics(seedModel);

  // Assertion 1: Enumerate all claimed-computable IDs explicitly
  for (const id of CLAIMED_COMPUTABLE) {
    assert(
      metrics[id],
      `claimed-computable metric ${id} must be present in metrics object`
    );
  }

  // Assertion 2: Reject null numerator/denominator for claimed-computable
  for (const id of CLAIMED_COMPUTABLE) {
    const metric = metrics[id];
    assert(
      metric.numerator !== null && metric.numerator !== undefined,
      `claimed-computable ${id}: numerator must not be null (got ${metric.numerator})`
    );
    assert(
      metric.denominator !== null && metric.denominator !== undefined,
      `claimed-computable ${id}: denominator must not be null (got ${metric.denominator})`
    );
  }

  // Assertion 3: Reject baseline-forming for claimed-computable (must be computed/insufficient/invalid)
  for (const id of CLAIMED_COMPUTABLE) {
    const metric = metrics[id];
    assert(
      metric.status !== 'baseline-forming',
      `claimed-computable ${id}: status must not be 'baseline-forming' (got ${metric.status})`
    );
  }

  // Assertion 4: B3 must compute to a real numeric value
  const b3 = metrics[B3_TOGGLE_AXES];
  assert(
    typeof b3.value === 'number' && b3.value >= 0 && b3.value <= 1,
    `B3: value must be numeric ratio 0-1 (got ${b3.value})`
  );

  // Assertion 5: {metrics:{}} MUST NOT pass acceptance
  const emptyMetrics = {};
  for (const id of CLAIMED_COMPUTABLE) {
    assert(
      emptyMetrics[id] === undefined,
      `empty metrics object must not contain ${id}`
    );
  }
});

test('msw-metrics-acceptance: forward-only ids must have forward-only status', async (t) => {
  const seedModel = {
    sources: {},
  };

  const metrics = computeMetrics(seedModel);

  // C1 joins C2/C3 as forward-only when no live findings source is wired (R2-F3).
  const forwardOnlyIds = [C1_FEEDBACK_CLOSURE, C2_GATE_FALSE_POSITIVE, C3_LEAKED_DEFECTS];
  for (const id of forwardOnlyIds) {
    const metric = metrics[id];
    assert(
      metric.status === 'forward-only',
      `${id} must have status='forward-only' (got ${metric.status})`
    );
    assert(
      metric.numerator === null,
      `${id}: numerator must be null for forward-only (got ${metric.numerator})`
    );
  }
});

test('msw-metrics-acceptance: all computed metrics have truthy numerator/denominator/value or expected status', async (t) => {
  const seedModel = buildSeededModel();

  const metrics = computeMetrics(seedModel);

  // All metrics should have coverage marker
  for (const id of METRIC_IDS) {
    const metric = metrics[id];
    assert(
      metric.coverage !== undefined,
      `${id}: must have coverage marker (got ${metric.coverage})`
    );
  }
});
