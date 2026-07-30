'use strict';

// msw-metrics: derive model → metric computation + anti-gaming integrity checks.
// PURE lib — no LLM, no writes, no side effects. Reads only.
// All metrics returned in form { numerator, denominator, value, integrity_ok, invalid_reason?, status, coverage }.
// status ∈ { computed, baseline-forming, forward-only, insufficient, invalid }
//
// Anti-gaming rules are mechanical checks run at compute time per measurement-design.md.
// Coverage signal per producer is separate from compute-time checks (F3 absorption).

const A1_WORK_COMPLETION_RATE = 'A1';
const A2_CONTEXT_REMAINING = 'A2';
const A4_RESTORE_RATE = 'A4';
const B1_STATUS_DRIFT = 'B1';
const B2_CONCURRENT_CONFLICTS = 'B2';
const B3_TOGGLE_AXES = 'B3';
const C1_FEEDBACK_CLOSURE = 'C1';
const C2_GATE_FALSE_POSITIVE = 'C2';
const C3_LEAKED_DEFECTS = 'C3';

const METRIC_IDS = [
  A1_WORK_COMPLETION_RATE,
  A2_CONTEXT_REMAINING,
  A4_RESTORE_RATE,
  B1_STATUS_DRIFT,
  B2_CONCURRENT_CONFLICTS,
  B3_TOGGLE_AXES,
  C1_FEEDBACK_CLOSURE,
  C2_GATE_FALSE_POSITIVE,
  C3_LEAKED_DEFECTS,
];

function computeMetrics(model) {
  const metrics = {};

  // A1: Work completion rate (forward-only, startup/completion events)
  // numerator = completed work units, denominator = all started units
  // Integrity: unit count spike (分할 의심) + inverted timestamps → invalid
  metrics[A1_WORK_COMPLETION_RATE] = computeA1(model);

  // A2: Session context remaining % — forward-only (downgraded, non-claimed).
  // Not session-bound/freshness-verified (see computeA2); denominator = observed session
  // count only, percentile/value not claimed. Old compute path (percentile) removed.
  metrics[A2_CONTEXT_REMAINING] = computeA2(model);

  // A4: Session boundary restore rate — forward-only (downgraded, non-claimed).
  // Not boundary-scoped (scanner self-credits current session, see computeA4);
  // denominator = items_left only, rate not claimed. Old compute/denominator-shrink path removed.
  metrics[A4_RESTORE_RATE] = computeA4(model);

  // B1: Status drift — documents vs independent evidence (partial)
  // numerator = drift count (absolute, not ratio), denominator = total work units with status
  // Integrity: two-source independence check → invalid if dependent
  metrics[B1_STATUS_DRIFT] = computeB1(model);

  // B2: Concurrent session conflicts — forward-only (downgraded, non-claimed).
  // No live collision producer (see computeB2); denominator = concurrent pairs only,
  // collision rate not claimed. Old denominator-zero-invalid/rate compute path removed.
  metrics[B2_CONCURRENT_CONFLICTS] = computeB2(model);

  // B3: Toggle axes — non-default usage (partial sopping, forward-only for usage)
  // numerator = actual usage count, denominator = all toggles in runtime surface (99)
  // Reports: toggle count + usage rate + operation branches (co-report branch count + blob-fold detection)
  // Integrity: version-fold (bundle config) vs branch count
  metrics[B3_TOGGLE_AXES] = computeB3(model);

  // C1: Feedback closure rate (finding events with type separation)
  // numerator = closures (excluding defer/downgrade/reject), denominator = all findings
  // Integrity: type separation (defer/downgrade/reject NOT counted as closure) → invalid if mixed
  // Integrity: so급 recoverability (probe verdict)
  metrics[C1_FEEDBACK_CLOSURE] = computeC1(model);

  // C2·C3: Forward-only (귀속 체인만, 값 never computed until label-protocol seeded)
  metrics[C2_GATE_FALSE_POSITIVE] = forwardOnlyMetric(C2_GATE_FALSE_POSITIVE);
  metrics[C3_LEAKED_DEFECTS] = forwardOnlyMetric(C3_LEAKED_DEFECTS);

  return metrics;
}

function computeA1(model) {
  // A1 work completion: startup/completion events from session-activity source
  const sessionActivity = model.sources?.session_activity;
  if (!sessionActivity || !sessionActivity.ok) {
    return insufficientMetric(A1_WORK_COMPLETION_RATE, 'session_activity source unavailable');
  }

  const startupCount = sessionActivity.task_startups_count || 0;
  const completedCount = sessionActivity.task_completions_count || 0;

  // Anti-gaming: unit count spike (直前週期比 비정상 증가)
  // Check: if startupCount >> prior recorded, flag분할 의심
  const unitSpikeFlag = startupCount > 50 && !model._priorStartupCount
    ? 'unit_count_spike_suspected' : null;

  // Anti-gaming: inverted timestamps (착수 시각 > 지시 시각)
  const inversionFlag = sessionActivity.inversion_detected ? 'timestamp_inversion_detected' : null;

  // 무결성 위반(invalid)은 producer 부재(forward-only)보다 강한 신호이므로 먼저 판정한다.
  const invalidReason = unitSpikeFlag || inversionFlag;
  if (invalidReason) {
    return {
      id: A1_WORK_COMPLETION_RATE,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: false,
      invalid_reason: invalidReason,
      status: 'invalid',
      coverage: sessionActivity.producer_coverage || 'unknown',
    };
  }

  // PR-Codex F2: 완료 신호(task_completed KIND 이벤트)를 emit하는 live producer가
  // 없으면 실 corpus에서 A1은 구조적으로 0/startups다. 이를 'computed 0%'로 표기하면
  // "모든 세션이 실패"로 오독된다. producer 부재 시 forward-only로 정직 표기 —
  // 완료 계측이 아직 배선 안 됐음을 드러낸다(0% 완료율 위장 금지). fixture는
  // completions_producer_present=true를 주입해 compute 경로를 실증한다.
  if (!sessionActivity.completions_producer_present) {
    return {
      id: A1_WORK_COMPLETION_RATE,
      numerator: null,
      denominator: startupCount,
      value: null,
      integrity_ok: true,
      invalid_reason: 'no live completion producer wired (task_completed events not emitted under current hook lifecycle)',
      status: 'forward-only',
      coverage: sessionActivity.producer_coverage || 'unknown',
    };
  }

  const value = startupCount > 0 ? completedCount / startupCount : null;
  return {
    id: A1_WORK_COMPLETION_RATE,
    numerator: completedCount,
    denominator: startupCount,
    value: value,
    integrity_ok: true,
    status: startupCount > 0 ? 'computed' : 'insufficient',
    coverage: sessionActivity.producer_coverage || 'unknown',
  };
}

function computeA2(model) {
  // A2 context remaining: from session-end events.
  // Downgrade (msw-m2-measurement-honesty-downgrade, Plan-Codex R1/PF3): session-end
  // reads a latest-wins context-current.json with no session-id/freshness binding and
  // stamps it onto the ending session's event, so a concurrent or stale sample can be
  // attributed to the wrong session. The samples are contaminated at the producer, so A2
  // is forward-only and excluded from claimed-computable (C1-pattern). The producer
  // (session-end.js) now emits null until session-bound freshness exists, so contaminated
  // samples stop accumulating in the append-only log. session count is kept as the
  // denominator so the observed session volume is preserved; only the percentile is not claimed.
  const sessionActivity = model.sources?.session_activity;
  if (!sessionActivity || !sessionActivity.ok) {
    return insufficientMetric(A2_CONTEXT_REMAINING, 'session_activity source unavailable');
  }

  const sessions = sessionActivity.sessions || [];
  return {
    id: A2_CONTEXT_REMAINING,
    numerator: null,
    denominator: sessions.length || null,
    value: null,
    integrity_ok: true,
    invalid_reason: 'context% not session-bound/freshness-verified (session-end reads latest-wins context-current.json)',
    status: 'forward-only',
    coverage: sessionActivity.producer_coverage || 'unknown',
  };
}

function computeA4(model) {
  // A4 restore rate: from handoff-items source.
  // Downgrade (msw-m2-measurement-honesty-downgrade, Plan-Codex R1): the handoff-items
  // scanner intersects ALL sidecars (including the current session's own, written at
  // session-end) with current unfinished items, so a first session self-credits its own
  // handoff as "restored" — a fake 100% restore rate with no session boundary crossed.
  // The compute is contaminated (not merely a missing producer), so a fixture flag would
  // masquerade an unfixed scanner. Until the scanner is boundary-scoped, A4 is
  // forward-only and excluded from claimed-computable (C1-pattern). items_left is kept
  // as the denominator so the observed backlog is preserved; only the rate is not claimed.
  const handoffItems = model.sources?.handoff_items;
  if (!handoffItems || !handoffItems.ok) {
    return insufficientMetric(A4_RESTORE_RATE, 'handoff_items source unavailable');
  }

  const itemsLeft = handoffItems.items_left_count || 0;
  return {
    id: A4_RESTORE_RATE,
    numerator: null,
    denominator: itemsLeft,
    value: null,
    integrity_ok: true,
    invalid_reason: 'restore rate not boundary-scoped (scanner self-credits current-session handoff items)',
    status: 'forward-only',
    coverage: handoffItems.producer_coverage || 'unknown',
  };
}

function computeB1(model) {
  // B1 status drift: documents vs independent evidence (partial)
  // Currently no independent evidence source available (ledger marked as unreliable)
  return insufficientMetric(B1_STATUS_DRIFT, 'independent evidence source unavailable');
}

function computeB2(model) {
  // B2 concurrent conflicts: from session-activity concurrent pairs + collision events.
  // Downgrade (msw-m2-measurement-honesty-downgrade, Plan-Codex R1/R2/R3): production
  // emits only session_start/session_end events, so no live collision producer exists —
  // collision_events_count is structurally 0 and a "computed 0%" would be confidently
  // wrong. Deriving a producer-present flag from observed collision events would tie it
  // to collision_events_count>0, making a legitimate computed-zero (a wired producer
  // observing zero collisions among N concurrent pairs) unreachable. Until an INDEPENDENT
  // collision-producer-presence signal exists (building it = building the producer,
  // out of scope), B2 is forward-only and excluded from claimed-computable (C1-pattern).
  // concurrent_pairs is kept as the denominator so concurrency observation is preserved;
  // only the collision rate is not claimed.
  const sessionActivity = model.sources?.session_activity;
  if (!sessionActivity || !sessionActivity.ok) {
    return insufficientMetric(B2_CONCURRENT_CONFLICTS, 'session_activity source unavailable');
  }

  const concurrentPairs = sessionActivity.concurrent_pairs_count || 0;
  return {
    id: B2_CONCURRENT_CONFLICTS,
    numerator: null,
    denominator: concurrentPairs,
    value: null,
    integrity_ok: true,
    invalid_reason: 'no live collision producer (production emits only session_start/session_end; computed-zero needs an independent producer-presence signal)',
    status: 'forward-only',
    coverage: sessionActivity.producer_coverage || 'unknown',
  };
}

function computeB3(model) {
  // B3 toggle axes: from toggle-usage source
  // numerator = actual non-default usage count, denominator = total toggles in runtime surface
  // Also reports: operation branch count (co-report for version-fold detection)
  const toggleUsage = model.sources?.toggle_usage;
  if (!toggleUsage || !toggleUsage.ok) {
    return insufficientMetric(B3_TOGGLE_AXES, 'toggle_usage source unavailable');
  }

  const totalToggles = toggleUsage.denominator || 0;
  const usedToggleCount = toggleUsage.used_toggle_count || 0;
  const operationBranchCount = toggleUsage.operation_branch_count || 0;

  if (totalToggles === 0) {
    return insufficientMetric(B3_TOGGLE_AXES, 'no toggles in runtime surface');
  }

  // Anti-gaming: co-report branch count + blob-fold detection
  const branchSuspicion = operationBranchCount > 100 ? 'branch_count_high' : null;

  const value = usedToggleCount / totalToggles;
  const status = branchSuspicion ? 'invalid' : 'computed';
  return {
    id: B3_TOGGLE_AXES,
    numerator: usedToggleCount,
    denominator: totalToggles,
    value: value,
    integrity_ok: !branchSuspicion,
    invalid_reason: branchSuspicion,
    status: status,
    operation_branches: operationBranchCount,
    coverage: toggleUsage.producer_coverage || 'unknown',
  };
}

function computeC1(model) {
  // C1 feedback closure: from finding events with type separation
  // C1는 이연·강등·기각을 해소로 계상하지 않음 (measurement-design.md §5 C1)
  const findings = model.sources?.findings;
  if (!findings || !findings.ok) {
    // PR-Codex R2-F3: findings derive source가 아예 배선돼 있지 않다(derive는
    // session_activity·toggle_usage·handoff_items만 등록). fixture만 findings를
    // 주입하므로, insufficient로 두면 fixture gate는 통과하나 실 derive는 절대
    // C1을 산출 못 한다(masquerade). forward-only로 정직 표기 — live source
    // 미배선을 드러내고 claimed-computable에서 제외(C2·C3 동형).
    return {
      id: C1_FEEDBACK_CLOSURE,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: true,
      invalid_reason: 'no live findings derive source wired',
      status: 'forward-only',
      coverage: 'n/a',
    };
  }

  const allFindings = findings.count || 0;
  const closedFindings = findings.closed_count || 0;
  const deferredFindings = findings.deferred_count || 0;
  const downgradedFindings = findings.downgraded_count || 0;
  const rejectedFindings = findings.rejected_count || 0;

  // Anti-gaming: 유형 분리 (defer/downgrade/reject NOT counted as closure)
  // Check: ensure type separation is clear
  const typeIntegrity = (deferredFindings + downgradedFindings + rejectedFindings) > 0
    && (closedFindings + deferredFindings + downgradedFindings + rejectedFindings) <= allFindings;

  if (!typeIntegrity) {
    return {
      id: C1_FEEDBACK_CLOSURE,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: false,
      invalid_reason: 'type_separation_violated',
      status: 'invalid',
      coverage: findings.producer_coverage || 'unknown',
    };
  }

  const value = allFindings > 0 ? closedFindings / allFindings : null;
  return {
    id: C1_FEEDBACK_CLOSURE,
    numerator: closedFindings,
    denominator: allFindings,
    value: value,
    integrity_ok: true,
    deferred_count: deferredFindings,
    downgraded_count: downgradedFindings,
    rejected_count: rejectedFindings,
    status: allFindings > 0 ? 'computed' : 'insufficient',
    coverage: findings.producer_coverage || 'unknown',
  };
}

function forwardOnlyMetric(id) {
  return {
    id: id,
    numerator: null,
    denominator: null,
    value: null,
    integrity_ok: true,
    status: 'forward-only',
    coverage: 'n/a',
  };
}

function insufficientMetric(id, reason) {
  return {
    id: id,
    numerator: null,
    denominator: null,
    value: null,
    integrity_ok: false,
    invalid_reason: reason,
    status: 'insufficient',
    coverage: 'unknown',
  };
}

// Re-export Task 7 & 8 implementations
const { measureA3 } = require('./a3-instruction-cost');
const { probeRecoverability } = require('./recoverability-probe');

module.exports = {
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
  // Task 7 & 8
  measureA3,
  probeRecoverability,
};
