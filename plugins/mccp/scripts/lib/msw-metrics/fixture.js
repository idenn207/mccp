'use strict';

// R2-F2 shared seeded fixture. Used by BOTH the `metrics-assert --fixtures`
// CLI gate and the acceptance test, so the mechanical gate and the test that
// guards it can never drift. Represents a minimal-but-representative derive
// model in which the sole claimed-computable metric (B3 — see below) has enough
// source data to compute a real (non-null, non-baseline-forming) value.
//
// msw-m2-measurement-honesty-downgrade (Plan-Codex R1/R3 + re-R3 F0): A2/A4/B2 are
// C1-pattern forward-only and NO validity flag is injected for them. A4/A2 have
// contaminated computations (self-credit / unverified stamp) and B2 has no
// independent collision-producer-presence signal, so injecting a fixture flag to
// force compute would masquerade an unfixed producer (same reason C1's findings
// source is not injected, below). The claimed-computable set is therefore just
// {B3}. A1 ALSO computes in this fixture (via the injected completions_producer_present
// flag, which exercises A1's compute path), but A1 is NOT claimed-computable — it is
// forward-only in real derive because production has no live task_completed producer
// (re-R3 F0), so the acceptance gate does not enumerate it. The session_activity/
// handoff_items numeric fields below are retained (harmless — A2/A4/B2 ignore them
// and return forward-only).
//
// The gate's whole point is that this forces compute — `{metrics:{}}` or an
// all-baseline-forming result can never satisfy the enumeration.
function buildSeededModel() {
  return {
    sources: {
      session_activity: {
        ok: true,
        task_startups_count: 5,
        task_completions_count: 3,
        // PR-Codex F2: fixture는 완료 producer가 배선된 상태를 시뮬레이션해 A1
        // compute 경로를 실증한다(실 corpus는 producer 부재로 forward-only).
        completions_producer_present: true,
        sessions: [
          { session_id: 'sid-1', context_remaining_pct: 45, task_completed: true },
          { session_id: 'sid-2', context_remaining_pct: 62, task_completed: true },
        ],
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
      // PR-Codex R2-F3: `findings` source는 실 derive에 배선돼 있지 않으므로
      // fixture에 주입하지 않는다(fake source 주입 = masquerade). C1은 forward-only.
    },
  };
}

module.exports = { buildSeededModel };
