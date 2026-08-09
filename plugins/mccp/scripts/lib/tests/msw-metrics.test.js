'use strict';

// msw-metrics unit test — anti-gaming integrity + forward-only honesty

const { test } = require('node:test');
const assert = require('node:assert');
const {
  computeMetrics,
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

test('A1: work completion rate computes value', (t) => {
  const model = {
    sources: {
      session_activity: {
        ok: true,
        task_startups_count: 10,
        task_completions_count: 7,
        // PR-Codex F2: compute 경로는 완료 producer가 배선됐을 때만.
        completions_producer_present: true,
        producer_coverage: 'session-activity',
      },
    },
  };

  const metrics = computeMetrics(model);
  const a1 = metrics[A1_WORK_COMPLETION_RATE];

  assert.strictEqual(a1.numerator, 7);
  assert.strictEqual(a1.denominator, 10);
  assert.strictEqual(a1.value, 0.7);
  assert.strictEqual(a1.integrity_ok, true);
});

test('A1: no live completion producer → forward-only (not computed 0%)', (t) => {
  // PR-Codex F2 회귀: 완료 producer가 없으면(실 hook 라이프사이클) A1은
  // 'computed 0%'가 아니라 forward-only여야 한다(0% 완료율 위장 금지).
  const model = {
    sources: {
      session_activity: {
        ok: true,
        task_startups_count: 4,
        task_completions_count: 0,
        completions_producer_present: false,
        producer_coverage: 'session-activity',
      },
    },
  };

  const a1 = computeMetrics(model)[A1_WORK_COMPLETION_RATE];
  assert.strictEqual(a1.status, 'forward-only');
  assert.strictEqual(a1.value, null);
  assert.match(a1.invalid_reason, /no live completion producer/);
});

test('A1: timestamp inversion detected → invalid', (t) => {
  const model = {
    sources: {
      session_activity: {
        ok: true,
        task_startups_count: 10,
        task_completions_count: 7,
        inversion_detected: true,
        producer_coverage: 'session-activity',
      },
    },
  };

  const metrics = computeMetrics(model);
  const a1 = metrics[A1_WORK_COMPLETION_RATE];

  assert.strictEqual(a1.status, 'invalid');
  assert.strictEqual(a1.integrity_ok, false);
  assert(a1.invalid_reason.includes('inversion'));
});

// msw-m2-measurement-honesty-downgrade (Plan-Codex R1/R3): A2/A4/B2 are downgraded to
// C1-pattern forward-only (removed from claimed-computable). Codex R3 found the earlier
// producer-flag design let confidently-wrong values through; these tests lock the honest
// forward-only state + the specific defects (A4 self-credit, A2 unverified stamp).

test('A2: context remaining → forward-only (not session-bound/freshness-verified)', (t) => {
  const model = {
    sources: {
      session_activity: {
        ok: true,
        sessions: [
          { context_remaining_pct: 20 },
          { context_remaining_pct: 40 },
          { context_remaining_pct: 60 },
        ],
        producer_coverage: 'session-activity',
      },
    },
  };

  const a2 = computeMetrics(model)[A2_CONTEXT_REMAINING];
  assert.strictEqual(a2.status, 'forward-only');
  assert.strictEqual(a2.value, null);
  assert.strictEqual(a2.numerator, null);
  assert.strictEqual(a2.denominator, 3); // session volume observation preserved
  assert.match(a2.invalid_reason, /not session-bound/);
});

test('A2: stale/cross-session sample is NOT attributed as a computed A2 value (Codex R3 F3)', (t) => {
  // Even with a numeric context_remaining_pct present (which the contaminated producer
  // could have stamped from another session), A2 must stay forward-only.
  const model = {
    sources: {
      session_activity: {
        ok: true,
        sessions: [{ context_remaining_pct: 99 }], // could be a stale/cross-session value
        producer_coverage: 'session-activity',
      },
    },
  };

  const a2 = computeMetrics(model)[A2_CONTEXT_REMAINING];
  assert.strictEqual(a2.status, 'forward-only');
  assert.strictEqual(a2.value, null);
});

test('A4: restore rate → forward-only (not boundary-scoped)', (t) => {
  const model = {
    sources: {
      handoff_items: {
        ok: true,
        items_left_count: 8,
        items_restored_count: 5,
        producer_coverage: 'handoff-items',
      },
    },
  };

  const a4 = computeMetrics(model)[A4_RESTORE_RATE];
  assert.strictEqual(a4.status, 'forward-only');
  assert.strictEqual(a4.value, null);
  assert.strictEqual(a4.numerator, null);
  assert.strictEqual(a4.denominator, 8); // backlog observation preserved
  assert.match(a4.invalid_reason, /boundary-scoped/);
});

test('A4: self-credit scenario does NOT report computed 100% (Codex R3 F2)', (t) => {
  // The contaminated scanner intersects the current session's own sidecar, so
  // items_left == items_restored (a fake 100%). A4 must be forward-only, never 1.0.
  const model = {
    sources: {
      handoff_items: {
        ok: true,
        items_left_count: 3,
        items_restored_count: 3,
        producer_coverage: 'handoff-items',
      },
    },
  };

  const a4 = computeMetrics(model)[A4_RESTORE_RATE];
  assert.strictEqual(a4.status, 'forward-only');
  assert.notStrictEqual(a4.value, 1);
});

test('B2: concurrent conflicts → forward-only (no live collision producer)', (t) => {
  const model = {
    sources: {
      session_activity: {
        ok: true,
        concurrent_pairs_count: 10,
        collision_events_count: 2,
        producer_coverage: 'session-activity',
      },
    },
  };

  const b2 = computeMetrics(model)[B2_CONCURRENT_CONFLICTS];
  assert.strictEqual(b2.status, 'forward-only');
  assert.strictEqual(b2.value, null);
  assert.strictEqual(b2.numerator, null);
  assert.strictEqual(b2.denominator, 10); // concurrency observation preserved
  // multi-session-work-loop M3: the SEMANTICS here are unchanged (a model with no
  // producer signal stays forward-only with a null value). Only the reason text
  // changed, because M3 now distinguishes the two ways B2 can fail to compute:
  // producer absent vs coverage gate not passed. Asserting on the new wording
  // keeps this test a guard rather than letting it pass on a stale message.
  assert.match(b2.invalid_reason, /no evidence_guard_active observed/);
});

test('B2 (M3): producer present but coverage gate NOT passed → still forward-only', () => {
  // The gate is load-bearing. A wired producer alone must not flip B2, or an
  // uncovered writer would be reported as `computed 0/N`.
  const model = {
    sources: {
      session_activity: {
        ok: true,
        concurrent_pairs_count: 10,
        collision_producer_present: true,
        coverage_gate_ok: false,
        overwrite_observed_count: 0,
        producer_coverage: 'session-activity',
      },
    },
  };
  const b2 = computeMetrics(model)[B2_CONCURRENT_CONFLICTS];
  assert.strictEqual(b2.status, 'forward-only');
  assert.strictEqual(b2.numerator, null);
  assert.match(b2.invalid_reason, /coverage gate/);
});

test('B2 (M3): producer present AND gate passed → computed', () => {
  const model = {
    sources: {
      session_activity: {
        ok: true,
        concurrent_pairs_count: 10,
        collision_producer_present: true,
        coverage_gate_ok: true,
        overwrite_observed_count: 1,
        conflict_prevented_count: 4,
        producer_coverage: 'session-activity',
      },
    },
  };
  const b2 = computeMetrics(model)[B2_CONCURRENT_CONFLICTS];
  assert.strictEqual(b2.status, 'computed');
  assert.strictEqual(b2.numerator, 1, 'only overwrite_observed counts as an incident');
  assert.strictEqual(b2.denominator, 10);
  assert.strictEqual(b2.value, 0.1);
  assert.strictEqual(b2.conflicts_prevented, 4, 'prevented is co-reported, never in the numerator');
});

test('B2: zero concurrent pairs also → forward-only, not invalid (C1-pattern)', (t) => {
  // The old denominator-zero invalid guard is gone; B2 is unconditionally forward-only
  // since it is not claimed-computable (Codex R3 F1 — no producer-flag branch to mis-order).
  const model = {
    sources: {
      session_activity: {
        ok: true,
        concurrent_pairs_count: 0,
        collision_events_count: 0,
        producer_coverage: 'session-activity',
      },
    },
  };

  const b2 = computeMetrics(model)[B2_CONCURRENT_CONFLICTS];
  assert.strictEqual(b2.status, 'forward-only');
  assert.strictEqual(b2.denominator, 0);
});

test('B3: toggle axes computes usage rate + branch count', (t) => {
  const model = {
    sources: {
      toggle_usage: {
        ok: true,
        used_toggle_count: 15,
        denominator: 100,
        operation_branch_count: 25,
        producer_coverage: 'toggle-usage',
      },
    },
  };

  const metrics = computeMetrics(model);
  const b3 = metrics[B3_TOGGLE_AXES];

  assert.strictEqual(b3.numerator, 15);
  assert.strictEqual(b3.denominator, 100);
  assert.strictEqual(b3.value, 0.15);
  assert.strictEqual(b3.operation_branches, 25);
});

test('C1: feedback closure separates resolve types', (t) => {
  const model = {
    sources: {
      findings: {
        ok: true,
        count: 20,
        closed_count: 12,
        deferred_count: 4,
        downgraded_count: 2,
        rejected_count: 2,
        producer_coverage: 'findings',
      },
    },
  };

  const metrics = computeMetrics(model);
  const c1 = metrics[C1_FEEDBACK_CLOSURE];

  assert.strictEqual(c1.numerator, 12);
  assert.strictEqual(c1.denominator, 20);
  assert.strictEqual(c1.value, 0.6);
  assert.strictEqual(c1.deferred_count, 4);
  assert.strictEqual(c1.downgraded_count, 2);
  assert.strictEqual(c1.rejected_count, 2);
  // Defer/downgrade/reject NOT counted as closure
  assert(c1.numerator + c1.deferred_count + c1.downgraded_count + c1.rejected_count <= c1.denominator);
});

test('C2: forward-only status', (t) => {
  const model = { sources: {} };
  const metrics = computeMetrics(model);
  const c2 = metrics[C2_GATE_FALSE_POSITIVE];

  assert.strictEqual(c2.status, 'forward-only');
  assert.strictEqual(c2.numerator, null);
  assert.strictEqual(c2.denominator, null);
});

test('C3: forward-only status', (t) => {
  const model = { sources: {} };
  const metrics = computeMetrics(model);
  const c3 = metrics[C3_LEAKED_DEFECTS];

  assert.strictEqual(c3.status, 'forward-only');
  assert.strictEqual(c3.value, null);
});

test('missing source → insufficient status', (t) => {
  const model = { sources: {} };
  const metrics = computeMetrics(model);

  for (const id of [A1_WORK_COMPLETION_RATE, A2_CONTEXT_REMAINING, A4_RESTORE_RATE]) {
    const metric = metrics[id];
    assert(
      metric.status === 'insufficient' || metric.status === 'forward-only',
      `${id} should be insufficient when source missing (got ${metric.status})`
    );
  }
});

test('all computed metrics have coverage marker', (t) => {
  const model = {
    sources: {
      session_activity: {
        ok: true,
        task_startups_count: 5,
        task_completions_count: 3,
        sessions: [{ context_remaining_pct: 50 }],
        concurrent_pairs_count: 1,
        collision_events_count: 0,
        producer_coverage: 'session-activity',
      },
      handoff_items: {
        ok: true,
        items_left_count: 3,
        items_restored_count: 2,
        producer_coverage: 'handoff-items',
      },
      toggle_usage: {
        ok: true,
        used_toggle_count: 8,
        denominator: 100,
        operation_branch_count: 15,
        producer_coverage: 'toggle-usage',
      },
      findings: {
        ok: true,
        count: 10,
        closed_count: 6,
        deferred_count: 2,
        downgraded_count: 1,
        rejected_count: 1,
        producer_coverage: 'findings',
      },
    },
  };

  const metrics = computeMetrics(model);

  for (const id of Object.keys(metrics)) {
    assert(
      metrics[id].coverage !== undefined,
      `${id}: must have coverage marker`
    );
  }
});
