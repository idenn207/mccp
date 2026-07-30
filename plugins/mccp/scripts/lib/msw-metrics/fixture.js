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
// {B3}. NO validity flag is injected for ANY downgraded metric — A1/A2/A4/B2 all
// resolve to forward-only here, matching real derive (A1 has no live task_completed
// producer in production either; re-R3 F0). A1's compute path is proven separately by a
// dedicated unit test with its own inline model (msw-metrics.test.js 'A1: work completion
// rate computes value'), so it does NOT need a forcing flag in this shared gate fixture —
// leaving one here would be the same masquerade the downgrade set out to remove. The
// session_activity/handoff_items numeric fields below are retained (harmless — A1/A2/A4/B2
// ignore them for compute purposes and return forward-only).
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
        // A1 completions_producer_present is intentionally NOT injected (re-R3 F0):
        // A1 is a downgraded, non-claimed metric, so forcing it to compute here would
        // reintroduce a masquerade flag into the shared gate fixture. A1's compute path
        // is proven by its own unit test (msw-metrics.test.js). A1 → forward-only here.
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
