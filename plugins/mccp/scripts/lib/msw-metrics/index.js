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

  // A2: Session context remaining % at endpoint (forward-only, session-end events)
  // numerator = specific session termination context%, denominator = sessions with end events
  // p50·p95 percentile reporting
  // Integrity: miscompletion-up (세션 미완료가 늘면 A1 실패와 조합) → invalid
  metrics[A2_CONTEXT_REMAINING] = computeA2(model);

  // A4: Session boundary restore rate (forward-only, handoff items)
  // numerator = items actually restored, denominator = items left by prior session
  // Integrity: denominator shrink (분모 축소 부풀리기) → flag
  metrics[A4_RESTORE_RATE] = computeA4(model);

  // B1: Status drift — documents vs independent evidence (partial)
  // numerator = drift count (absolute, not ratio), denominator = total work units with status
  // Integrity: two-source independence check → invalid if dependent
  metrics[B1_STATUS_DRIFT] = computeB1(model);

  // B2: Concurrent session conflicts (forward-only, concurrent pairs + collision events)
  // numerator = collisions, denominator = concurrent session pairs
  // Integrity: if denom=0, invalid (可 直列化·衝突無し区別不可)
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
  // A2 context remaining: from session-end events
  const sessionActivity = model.sources?.session_activity;
  if (!sessionActivity || !sessionActivity.ok) {
    return insufficientMetric(A2_CONTEXT_REMAINING, 'session_activity source unavailable');
  }

  const sessions = sessionActivity.sessions || [];
  const withContext = sessions.filter(s => s.context_remaining_pct !== null && s.context_remaining_pct !== undefined);

  if (withContext.length === 0) {
    return insufficientMetric(A2_CONTEXT_REMAINING, 'no sessions with context_remaining_pct recorded');
  }

  // Anti-gaming: miscompletion-up (미완 종료 건이 늘면 A1 실패 조합) → check via A1 state
  // For now, just compute p50/p95
  const values = withContext.map(s => s.context_remaining_pct).sort((a, b) => a - b);
  const p50 = values[Math.floor(values.length * 0.5)];
  const p95 = values[Math.floor(values.length * 0.95)];

  return {
    id: A2_CONTEXT_REMAINING,
    numerator: withContext.length, // sessions with context data
    denominator: sessions.length,   // all sessions
    value: { p50, p95 },
    integrity_ok: true,
    status: sessions.length > 0 ? 'computed' : 'insufficient',
    coverage: sessionActivity.producer_coverage || 'unknown',
  };
}

function computeA4(model) {
  // A4 restore rate: from handoff-items source
  const handoffItems = model.sources?.handoff_items;
  if (!handoffItems || !handoffItems.ok) {
    return insufficientMetric(A4_RESTORE_RATE, 'handoff_items source unavailable');
  }

  const itemsLeft = handoffItems.items_left_count || 0;
  const itemsRestored = handoffItems.items_restored_count || 0;

  // Anti-gaming: denominator shrink (分모 축소 부풀리기)
  const denominatorShrinkFlag = itemsLeft < (model._priorItemsLeft || itemsLeft)
    ? 'denominator_shrink_suspected' : null;

  if (denominatorShrinkFlag) {
    return {
      id: A4_RESTORE_RATE,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: false,
      invalid_reason: denominatorShrinkFlag,
      status: 'invalid',
      coverage: handoffItems.producer_coverage || 'unknown',
    };
  }

  const value = itemsLeft > 0 ? itemsRestored / itemsLeft : null;
  return {
    id: A4_RESTORE_RATE,
    numerator: itemsRestored,
    denominator: itemsLeft,
    value: value,
    integrity_ok: true,
    status: itemsLeft > 0 ? 'computed' : 'insufficient',
    coverage: handoffItems.producer_coverage || 'unknown',
  };
}

function computeB1(model) {
  // B1 status drift: documents vs independent evidence (partial)
  // Currently no independent evidence source available (ledger marked as unreliable)
  return insufficientMetric(B1_STATUS_DRIFT, 'independent evidence source unavailable');
}

function computeB2(model) {
  // B2 concurrent conflicts: from session-activity concurrent pairs + collision events
  const sessionActivity = model.sources?.session_activity;
  if (!sessionActivity || !sessionActivity.ok) {
    return insufficientMetric(B2_CONCURRENT_CONFLICTS, 'session_activity source unavailable');
  }

  const concurrentPairs = sessionActivity.concurrent_pairs_count || 0;
  const collisions = sessionActivity.collision_events_count || 0;

  // Anti-gaming: if denominator=0, invalid (can't distinguish serialization from no-collision)
  if (concurrentPairs === 0) {
    return {
      id: B2_CONCURRENT_CONFLICTS,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: false,
      invalid_reason: 'denominator_zero',
      status: 'invalid',
      coverage: sessionActivity.producer_coverage || 'unknown',
    };
  }

  const value = collisions / concurrentPairs;
  return {
    id: B2_CONCURRENT_CONFLICTS,
    numerator: collisions,
    denominator: concurrentPairs,
    value: value,
    integrity_ok: true,
    status: 'computed',
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
