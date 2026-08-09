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
        // multi-session-work-loop M3 — B2 is claimed-computable again, so the
        // shared gate fixture must exercise its compute path.
        //
        // This is NOT the masquerade flag the M2 downgrade removed. The rule M2
        // set was: never inject a validity flag for a metric whose producer does
        // not exist in production. M3 BUILDS that producer —
        // `evidence_guard_active` is emitted by every guarded receipt write
        // (receipt/evidence-lock.js), so `collision_producer_present` is
        // genuinely live-derivable from a real corpus. Injecting it here
        // reproduces a state production actually reaches, which is exactly the
        // condition A1/A2/A4 still fail to meet (they stay un-injected below).
        //
        // `coverage_gate_ok` mirrors the b2-coverage-gate verdict artifact; the
        // gate's own falsifiability is proven separately in
        // lib/tests/b2-coverage-gate.test.js (negative fixtures).
        collision_producer_present: true,
        coverage_gate_ok: true,
        guard_active_count: 3,
        overwrite_observed_count: 0,     // 목표 0 — computed-zero가 정당하게 도달 가능
        conflict_prevented_count: 1,     // 병기만, 분자 미계상
        claim_denied_count: 0,
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
        // M4 — 제외 전/후 두 분모를 함께 낸다(G3). 하나만 내면 명명된 제외가
        // 감축으로 오독된다. raw - excluded === denominator 항등이 계약이다.
        raw_surface_count: 110,
        excluded_count: 10,
        operation_branch_count: 215,
        operation_branch_method: 'enum-table+boolean-floor (lower bound)',
        // M4 — producer presence는 사용 건수와 직교하는 신호다(A1·B2 선례).
        // 이 flag가 없으면 B3는 forward-only이며, 그것이 실 corpus의 현재 상태다:
        // session-start.js가 스냅샷 경로를 cwd 기준으로 풀어 M2 이후 단 한 건도
        // 기록되지 않았고(M4 Task 6이 수정), 그 위에서 `computed 0%`를 내던 것이
        // 정확히 M2가 A1·A2·A4·B2에서 강등시킨 confidently-wrong 패턴이다.
        // fixture는 compute 경로를 실증하기 위해 corpus 존재를 주입한다.
        snapshot_corpus_present: true,
        snapshot_files_read: 3,
        // 존재 판정의 기준은 **파싱에 성공한** 스냅샷이다 — 읽히기만 하고
        // 해석되지 않은 파일은 이력이 아니므로 fixture도 그 구분을 갖는다.
        snapshot_files_parsed: 3,
        // 제외가 규범 문서(measurement-design.md §B3)의 이름과 일치할 때만 이
        // 분모를 발행할 수 있다(G3). fixture가 이 값을 밝히지 않으면 compute
        // 경로는 정직하게 invalid로 떨어진다 — 게이트를 느슨하게 푸는 대신
        // fixture가 대조 결과를 명시한다.
        exclusion_doc_ok: true,
        exclusion_doc_drift: [],
        degraded: false,
      },
      // M4 — A3는 커밋 아티팩트(docs/multi-session-work-loop/a3-baseline.json)를
      // 읽는 instruction-cost 소스에서 온다. derive는 tokenizer를 절대 돌리지
      // 않는다(렌더 예산). stale=false여야 computed이며, CLAUDE.md가 바뀌면
      // 실 derive는 insufficient로 정직 강등된다.
      instruction_cost: {
        ok: true,
        artifact_present: true,
        artifact_path: 'docs/multi-session-work-loop/a3-baseline.json',
        status: 'computed',
        baseline_tokens: 45646,
        current_tokens: 23028,
        denominator_tokens: 200000,
        reduction_ratio: 0.4955,
        claude_md_reduction_ratio: 0.5054,
        measured_at: '2026-08-09T00:00:00.000Z',
        tokenizer_version: '0.13.0',
        tokenizer_version_source: 'tokenizing-process',
        stale: false,
        stale_reason: null,
        producer_coverage: 'instruction-cost',
      },
      // PR-Codex R2-F3: `findings` source는 실 derive에 배선돼 있지 않으므로
      // fixture에 주입하지 않는다(fake source 주입 = masquerade). C1은 forward-only.
    },
  };
}

module.exports = { buildSeededModel };
