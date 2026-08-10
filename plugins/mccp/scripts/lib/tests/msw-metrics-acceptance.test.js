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
  A3_INSTRUCTION_COST,
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

// Claimed-computable IDs: B3 only — the sole metric with a live production producer
// (env-snapshot toggle scan) that yields real computed values. msw-m2-measurement-
// honesty-downgrade (Plan-Codex R1/R3 + re-R3 F0): A1/A2/A4/B2 were all removed. A2/A4
// have contaminated computations (self-credit / unverified stamp), B2 has no independent
// collision-producer-presence signal, and A1 has no live task_completed producer. All
// are forward-only in real derive AND in the shared fixture (re-R3 F0 removed A1's flag);
// keeping them claimed would green the acceptance gate on the fixture while production
// cannot satisfy the null-numerator contract.
// Forward-only: A1/A2/A4/B2 (downgraded), C1 (no live findings source — PR-Codex R2-F3),
// C2/C3 (귀속 미구축). Not computed: B1 (no independent evidence source).
// multi-session-work-loop M3 — B2 is promoted back into the claimed set. This
// list is deliberately the guard against SILENT promotion, so editing it is the
// sanctioned way to promote and it must stay in lockstep with derive/cli.js.
//
// The promotion is justified, not convenient: the PF2 argument that downgraded
// B2 was "no INDEPENDENT collision-producer-presence signal exists". M3 builds
// that producer — `evidence_guard_active` fires on every guarded receipt write,
// so presence is orthogonal to incident count and a computed-zero is reachable.
// The flip is additionally gated on a falsifiable runtime coverage audit
// (b2-coverage-gate.js), whose own falsifiability is pinned by negative fixtures
// in lib/tests/b2-coverage-gate.test.js.
// multi-session-work-loop M4 — A3 joins the claimed set. Same sanctioned path
// as B2's M3 promotion: edit this list deliberately, with the justification.
//
// A3 was never computable before: `measureA3` spawned a hardcoded `python3`,
// which on this platform is the WindowsApps stub, so every run returned
// `baseline-unavailable`; and `computeMetrics` never called it at all (it was
// import-and-re-export only). M4 fixes the interpreter probe, pins the tokenizer
// version inside the tokenizing process, and routes A3 through an
// instruction-cost derive source that reads a committed artifact. Live derive
// now yields real numbers.
//
// The promotion is falsifiable rather than convenient: the source re-hashes
// CLAUDE.md against the artifact's recorded digest, so letting the artifact go
// stale degrades A3 to `insufficient` instead of serving an old number as
// current. Byte-based estimation stays prohibited, so "no tokenizer" means "no
// A3", never a guess.
//
// B3 stays claimed, but note what changed underneath it: its producer was in
// fact writing nothing (session-start.js resolved the snapshot path against cwd)
// and B3 was reporting `computed 0%` over an empty corpus. M4 Task 6 fixes the
// producer and gates the compute path on `snapshot_corpus_present`, so LIVE B3
// reads forward-only until one session has run under the fix. The fixture below
// injects the presence flag to prove the compute path, exactly as B2 does.
const CLAIMED_COMPUTABLE = [
  A3_INSTRUCTION_COST,
  B2_CONCURRENT_CONFLICTS,
  B3_TOGGLE_AXES,
];
// Downgraded metrics: present in the seeded fixture but must resolve to forward-only,
// so they can never be silently promoted back into the claimed-computable enumeration.
// A1 is included now — the shared fixture injects NO validity flag for any downgraded
// metric (re-R3 F0), so A1 is forward-only in the fixture too; its compute path is proven
// by a dedicated unit test with its own model (msw-metrics.test.js 'A1: work completion
// rate computes value').
// B2 left this list in M3 (see CLAIMED_COMPUTABLE above). A1/A2/A4 stay: their
// producers are still absent or contaminated, so no fixture flag is injected for
// them and they must resolve to forward-only.
const DOWNGRADED_FORWARD_ONLY = [
  A1_WORK_COMPLETION_RATE,
  A2_CONTEXT_REMAINING,
  A4_RESTORE_RATE,
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

  // Assertion 6 (downgrade): A2/A4/B2 have source data in the seeded fixture but MUST
  // resolve to forward-only (null numerator) — proving they are not silently promoted
  // back into claimed-computable (Plan-Codex R1 PF2 / R3-F0).
  for (const id of DOWNGRADED_FORWARD_ONLY) {
    const metric = metrics[id];
    assert(
      metric.status === 'forward-only',
      `downgraded ${id}: status must be 'forward-only' (got ${metric.status})`
    );
    assert(
      metric.numerator === null,
      `downgraded ${id}: numerator must be null (got ${metric.numerator})`
    );
    assert(
      !CLAIMED_COMPUTABLE.includes(id),
      `downgraded ${id}: must not be in the claimed-computable set`
    );
  }
});

test('msw-metrics-acceptance: A1 is NOT claimed-computable and is forward-only without a live producer (re-R3 F0)', async (t) => {
  // A1 has no live task_completed producer in production, so a real-corpus model (no
  // completions_producer_present) must yield forward-only, and A1 must be excluded from
  // the claimed-computable set — same PF2 rule applied to B2/A4/A2.
  assert(
    !CLAIMED_COMPUTABLE.includes(A1_WORK_COMPLETION_RATE),
    'A1 must NOT be in the claimed-computable set (no live task_completed producer)'
  );
  const realCorpusModel = {
    sources: {
      session_activity: {
        ok: true,
        task_startups_count: 6,
        task_completions_count: 0,
        // completions_producer_present intentionally absent — real production state.
        producer_coverage: 'session-activity',
      },
    },
  };
  const a1 = computeMetrics(realCorpusModel)[A1_WORK_COMPLETION_RATE];
  assert.strictEqual(a1.status, 'forward-only', 'A1 must be forward-only without a live completion producer');
  assert.strictEqual(a1.numerator, null);
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
