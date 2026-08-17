'use strict';

// msw-metrics unit test — anti-gaming integrity + forward-only honesty

const { test } = require('node:test');
const assert = require('node:assert');
const {
  computeMetrics,
  A1_WORK_COMPLETION_RATE,
  A2_CONTEXT_REMAINING,
  A3_INSTRUCTION_COST,
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
        // round 4: the denominator is only publishable when the normative
        // exclusion table and the code agree; fixtures must say so explicitly.
        exclusion_doc_ok: true,
        ok: true,
        used_toggle_count: 15,
        denominator: 100,
        raw_surface_count: 108,
        excluded_count: 8,
        operation_branch_count: 25,
        // M4 contract change (explicit): producer presence now gates the compute
        // path, mirroring A1's completions_producer_present and B2's
        // collision_producer_present. Without it B3 is forward-only.
        snapshot_corpus_present: true,
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
  assert.strictEqual(b3.raw_surface_count, 108, 'pre-exclusion denominator co-reported');
  assert.strictEqual(b3.excluded_count, 8);
});

test('A3: computes occupancy from the committed artifact', (t) => {
  const metrics = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true, artifact_present: true, status: 'computed',
        baseline_tokens: 45646, current_tokens: 23028, denominator_tokens: 200000,
        reduction_ratio: 0.4955, claude_md_reduction_ratio: 0.5054,
        tokenizer_version: '0.13.0', stale: false, producer_coverage: 'instruction-cost',
      },
    },
  });
  const a3 = metrics.A3;

  assert.strictEqual(a3.status, 'computed');
  assert.strictEqual(a3.numerator, 23028);
  assert.strictEqual(a3.denominator, 200000);
  // The value cell is the metric's own definition (occupancy), not the reduction.
  // Rendering the reduction as the headline under the name "상시 지시문 점유율"
  // would reintroduce the label/value mismatch M4 just fixed on C2/C3.
  assert.ok(Math.abs(a3.value - 0.11514) < 1e-6);
  assert.ok(Math.abs(a3.reduction_ratio - 0.4955) < 1e-9, 'reduction is co-reported, not the value');
});

test('A3: a stale artifact degrades to insufficient, never a stale "computed"', (t) => {
  const metrics = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true, artifact_present: true, status: 'computed',
        current_tokens: 23028, denominator_tokens: 200000,
        stale: true, stale_reason: 'CLAUDE.md changed since the A3 measurement',
        producer_coverage: 'instruction-cost',
      },
    },
  });
  const a3 = metrics.A3;

  assert.strictEqual(a3.status, 'insufficient');
  assert.strictEqual(a3.numerator, null, 'a measurement of a tree that no longer exists is not a value');
  assert.match(a3.invalid_reason, /CLAUDE\.md changed/);
});

test('A3: no artifact is forward-only with the emit instruction, never an estimate', (t) => {
  // measurement-design.md §A3 prohibits byte-based estimation (bytes/4 is ~12%
  // off on this Korean-dense corpus), so "no tokenizer run" must say so rather
  // than substitute a guess.
  const metrics = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true, artifact_present: false,
        artifact_path: 'docs/multi-session-work-loop/a3-baseline.json',
        producer_coverage: 'instruction-cost',
      },
    },
  });
  const a3 = metrics.A3;

  assert.strictEqual(a3.status, 'forward-only');
  assert.strictEqual(a3.numerator, null);
  assert.match(a3.invalid_reason, /a3 --emit/);
});

test('B3: an empty env-snapshot corpus is forward-only, not "computed 0%"', (t) => {
  // Regression for the defect this milestone found: session-start.js resolved
  // the snapshot path against cwd, so no *.env-snapshot.json was ever written,
  // and B3 reported `{used: 0, denominator: 103, degraded: false}` — a confident
  // "nobody uses any toggle" derived from a corpus that never existed.
  const metrics = computeMetrics({
    sources: {
      toggle_usage: {
        // round 4: the denominator is only publishable when the normative
        // exclusion table and the code agree; fixtures must say so explicitly.
        exclusion_doc_ok: true,
        ok: true,
        used_toggle_count: 0,
        denominator: 94,
        raw_surface_count: 104,
        excluded_count: 10,
        operation_branch_count: 199,
        snapshot_corpus_present: false,
        producer_coverage: 'toggle-usage',
      },
    },
  });
  const b3 = metrics[B3_TOGGLE_AXES];

  assert.strictEqual(b3.status, 'forward-only');
  assert.strictEqual(b3.numerator, null, 'no usage claim may be made from an empty corpus');
  assert.strictEqual(b3.denominator, 94, 'the denominator is still known and reported');
  assert.match(b3.invalid_reason, /no env-snapshot corpus/);
  assert.strictEqual(b3.operation_branches, 199,
    'the anti-gaming branch co-report survives producer absence (it counts the surface, not usage)');
});

test('B3: a high branch count is co-reported, never an integrity violation', (t) => {
  // M4 removed an `operation_branch_count > 100 -> invalid` rule that appears
  // nowhere in measurement-design.md. The contract's B3 integrity check is fold
  // detection ("토글 수는 줄었는데 분기 수는 그대로"), not an absolute ceiling.
  // Counting branches over the real surface yields ~199, so the old rule would
  // have marked B3 invalid for being computed correctly.
  const metrics = computeMetrics({
    sources: {
      toggle_usage: {
        // round 4: the denominator is only publishable when the normative
        // exclusion table and the code agree; fixtures must say so explicitly.
        exclusion_doc_ok: true,
        ok: true,
        used_toggle_count: 12,
        denominator: 94,
        raw_surface_count: 104,
        excluded_count: 10,
        operation_branch_count: 199,
        snapshot_corpus_present: true,
        producer_coverage: 'toggle-usage',
      },
    },
  });
  const b3 = metrics[B3_TOGGLE_AXES];

  assert.strictEqual(b3.status, 'computed');
  assert.strictEqual(b3.integrity_ok, true);
  assert.strictEqual(b3.invalid_reason, null);
  assert.match(b3.branch_fold_check, /forward-only/,
    'fold detection needs a prior-cycle pair, which is honestly reported as absent');
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
        // round 4: the denominator is only publishable when the normative
        // exclusion table and the code agree; fixtures must say so explicitly.
        exclusion_doc_ok: true,
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

// --------------------------------- santa-loop round 4: consumers must not flatten
//
// Three rounds running, a fix landed on the producer while the consumer kept
// collapsing the signal: the source learned to say "degraded"/"unparsable", and
// computeA3/computeB3 published anyway. These assert at the PUBLISHING layer,
// which is where the earlier helper-level tests stopped.

test('A3: a corrupt artifact is invalid, not "no artifact emitted yet"', () => {
  const a3 = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true,
        artifact_present: false,
        degraded: true,
        invalid_count: 1,
        error: 'a3 artifact unparsable: Unexpected token }',
        artifact_path: 'docs/multi-session-work-loop/a3-baseline.json',
        producer_coverage: 'a3-instruction-cost',
      },
    },
  })[A3_INSTRUCTION_COST];

  assert.strictEqual(a3.status, 'invalid',
    'corruption and absence are different facts and must not share a status');
  assert.strictEqual(a3.integrity_ok, false);
  assert.match(a3.invalid_reason, /unparsable/);
  assert.doesNotMatch(a3.invalid_reason, /no A3 artifact emitted yet/);
});

test('A3: a genuinely absent artifact stays forward-only', () => {
  const a3 = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true, artifact_present: false, degraded: false, error: null,
        artifact_path: 'docs/multi-session-work-loop/a3-baseline.json',
        producer_coverage: 'a3-instruction-cost',
      },
    },
  })[A3_INSTRUCTION_COST];

  assert.strictEqual(a3.status, 'forward-only', 'absence must not be reported as corruption either');
  assert.strictEqual(a3.integrity_ok, true);
});

test('B3: exclusion-table drift makes the metric invalid, not a published number', () => {
  const b3 = computeMetrics({
    sources: {
      toggle_usage: {
        ok: true,
        denominator: 96,
        raw_surface_count: 106,
        used_toggle_count: 4,
        operation_branch_count: 203,
        snapshot_corpus_present: true,
        snapshot_files_read: 1,
        snapshot_files_parsed: 1,
        exclusion_doc_ok: false,
        exclusion_doc_drift: ['excluded in code but not named in the normative table: MCCP_FAKE'],
        degraded: true,
        error: 'exclusion table drift — the denominator is not the one measurement-design.md §B3 names',
        producer_coverage: 'toggle-usage',
      },
    },
  })[B3_TOGGLE_AXES];

  assert.strictEqual(b3.status, 'invalid',
    'a denominator the normative table does not endorse must not be published');
  assert.strictEqual(b3.integrity_ok, false);
  assert.strictEqual(b3.value, null);
  assert.match(b3.invalid_reason, /drift/);
});

test('B3: a clean cross-check still publishes normally', () => {
  const b3 = computeMetrics({
    sources: {
      toggle_usage: {
        ok: true,
        denominator: 96,
        raw_surface_count: 106,
        used_toggle_count: 4,
        operation_branch_count: 203,
        snapshot_corpus_present: true,
        snapshot_files_read: 1,
        snapshot_files_parsed: 1,
        exclusion_doc_ok: true,
        exclusion_doc_drift: [],
        degraded: false,
        error: null,
        producer_coverage: 'toggle-usage',
      },
    },
  })[B3_TOGGLE_AXES];

  assert.notStrictEqual(b3.status, 'invalid',
    'the new gate must not swallow the healthy path');
  assert.strictEqual(b3.integrity_ok, true);
});

test('A3: the published metric discloses what its freshness check covers', () => {
  // The numerator has three components but only CLAUDE.md can be verified from
  // the repo (STATE.md is session-volatile, the memory digest is never
  // committed). That is a deliberate limit, so the metric states it rather than
  // letting "current occupancy" imply the check covered the whole number.
  const a3 = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true,
        artifact_present: true,
        status: 'computed',
        current_tokens: 25644,
        baseline_tokens: 45646,
        denominator_tokens: 200000,
        freshness_scope: 'claude_md',
        numerator_components: ['claude_md', 'memory_index', 'state_block'],
        producer_coverage: 'a3-instruction-cost',
      },
    },
  })[A3_INSTRUCTION_COST];

  assert.strictEqual(a3.freshness_scope, 'claude_md');
  assert.deepStrictEqual(a3.numerator_components, ['claude_md', 'memory_index', 'state_block']);
  assert.ok(a3.numerator_components.length > 1,
    'the disclosure only means something because more components exist than are checked');
});

test('A3: a stale artifact carries the staleness forward, not just "insufficient"', () => {
  // Round 5: `insufficient` alone is indistinguishable from "no baseline yet",
  // and every surface downstream hides that quietly. A measurement that EXISTS
  // and went out of date is an instruction ("re-run --emit-after"), so the flag
  // has to travel with the metric for the renderer and the banner to see it.
  const a3 = computeMetrics({
    sources: {
      instruction_cost: {
        ok: true,
        artifact_present: true,
        status: 'computed',
        stale: true,
        stale_reason: 'CLAUDE.md changed since the A3 measurement',
        current_tokens: 26377,
        denominator_tokens: 200000,
        producer_coverage: 'a3-instruction-cost',
      },
    },
  })[A3_INSTRUCTION_COST];

  assert.strictEqual(a3.status, 'insufficient');
  assert.strictEqual(a3.stale, true, 'the staleness must survive into the metric');
  assert.match(a3.stale_reason, /CLAUDE\.md changed/);
  assert.strictEqual(a3.value, null, 'a stale measurement must not be served as a current value');
});

// --- B1 사다리 (multi-session-work-loop M6) ---------------------------------
//
// 4분기를 **각각** 단언한다. `degraded` 와 `independence_ok` 는 코드에서 OR 로 묶여
// 있으므로 하나만 test 하면 나머지 분기가 미검증으로 남는다.

function b1Source(over) {
  return Object.assign({
    ok: true,
    degraded: false,
    error: null,
    independence_ok: true,
    producer_coverage: 'milestone-evidence',
    denominator: 10,
    drift_count: 2,
    drift_items: [{ prd: 'p.prd.md', milestone: 'M1', doc_status: 'pending', evidence_verdict: 'shipped', evidence_ref: 'r.json' }],
    adjudications: [],
    undetermined_evidence_count: 3,
    noncanonical_status_count: 1,
    no_plan_count: 2,
    archived_excluded_count: 4,
    raw_row_count: 11,
    warnings: [],
  }, over || {});
}

function b1(over) {
  return computeMetrics({ sources: { milestone_evidence: b1Source(over) } })[B1_STATUS_DRIFT];
}

test('B1-LADDER-DEGRADED: a degraded source yields invalid, not insufficient', () => {
  // 무결성 위반(invalid)을 producer 부재(insufficient)보다 **먼저** 판정한다.
  // degraded 한 증거에서 뽑은 건수는 "값이 없다" 가 아니라 "값을 믿을 수 없다" 다.
  const m = b1({ degraded: true, error: 'row identity violated' });
  assert.strictEqual(m.status, 'invalid');
  assert.strictEqual(m.integrity_ok, false);
  assert.strictEqual(m.numerator, null);
  assert.strictEqual(m.denominator, null);
  assert.match(m.invalid_reason, /row identity violated/);
});

test('B1-LADDER-INDEPENDENCE: independence_ok=false yields invalid on its own axis', () => {
  // degraded 와 별개 단언이다 — 둘이 OR 로 묶여 있어 하나만 test 하면 나머지가 미검증.
  const m = b1({ degraded: false, independence_ok: false });
  assert.strictEqual(m.status, 'invalid');
  assert.strictEqual(m.integrity_ok, false);
  assert.match(m.invalid_reason, /independence/i);
});

test('B1-LADDER-EMPTY: a zero denominator yields insufficient, not invalid', () => {
  // 대조할 정규 status 행이 없는 것은 모순이 아니라 데이터의 부재다.
  // 두 상태를 가르는 것은 `status` 다 — `integrity_ok` 는 이 파일의 기존 관례상
  // insufficientMetric 도 false 로 두므로(A1·B2·B3 전부 동일) 구분자가 아니다.
  const m = b1({ denominator: 0, drift_count: 0 });
  assert.strictEqual(m.status, 'insufficient');
  assert.notStrictEqual(m.status, 'invalid');
  assert.strictEqual(m.coverage, 'milestone-evidence', 'coverage must survive the insufficient branch');
  assert.strictEqual(m.raw_row_count, 11, 'co-report must survive the insufficient branch');
});

test('B1-LADDER-COMPUTED: a healthy source computes a COUNT with all co-reported fields', () => {
  const m = b1({});
  assert.strictEqual(m.status, 'computed');
  assert.strictEqual(m.integrity_ok, true);
  assert.strictEqual(m.numerator, 2, 'numerator is the absolute drift COUNT');
  assert.strictEqual(m.denominator, 10);
  // UI4 — 계약은 건수이지 비율이 아니다. 비율을 실으면 분모가 큰 저장소에서 drift 가
  // 작아 보이는 왜곡이 생긴다.
  assert.strictEqual(m.value, null, 'B1 must never carry a ratio');
  // 병기 7필드
  assert.strictEqual(m.undetermined_evidence_count, 3);
  assert.strictEqual(m.noncanonical_status_count, 1);
  assert.strictEqual(m.no_plan_count, 2);
  assert.strictEqual(m.archived_excluded_count, 4);
  assert.strictEqual(m.raw_row_count, 11);
  assert.strictEqual(m.evidence_source, 'milestone-evidence');
  assert.strictEqual(m.independence_ok, true);
  assert.ok(Array.isArray(m.drift_items) && m.drift_items.length === 1);
});

test('B1: source 부재는 insufficient (invalid 가 아니다)', () => {
  assert.strictEqual(computeMetrics({ sources: {} })[B1_STATUS_DRIFT].status, 'insufficient');
  const notOk = computeMetrics({ sources: { milestone_evidence: b1Source({ ok: false }) } })[B1_STATUS_DRIFT];
  assert.strictEqual(notOk.status, 'insufficient');
});
