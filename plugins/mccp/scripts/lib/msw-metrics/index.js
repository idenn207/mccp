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
const A3_INSTRUCTION_COST = 'A3';
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
  A3_INSTRUCTION_COST,
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

  // A3: Instruction-cost occupancy — injected instruction tokens / context window.
  // M4 wires this into computeMetrics for the first time: measureA3 used to be
  // re-exported here but never called, and derive/cli.js was its only caller, so
  // the renderer's model carried no A3 at all.
  metrics[A3_INSTRUCTION_COST] = computeA3(model);

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

function computeA3(model) {
  // A3 instruction cost: from the committed artifact via the instruction-cost
  // derive source. measurement-design.md §A3 forbids byte-based estimation, so
  // there is no fallback path — no tokenizer run means no A3, stated plainly.
  const src = model.sources?.instruction_cost;
  if (!src || !src.ok) {
    return insufficientMetric(A3_INSTRUCTION_COST, 'instruction_cost source unavailable');
  }

  const coReport = {
    reduction_ratio: Number.isFinite(src.reduction_ratio) ? src.reduction_ratio : null,
    claude_md_reduction_ratio: Number.isFinite(src.claude_md_reduction_ratio)
      ? src.claude_md_reduction_ratio : null,
    baseline_tokens: src.baseline_tokens,
    tokenizer_version: src.tokenizer_version,
    measured_at: src.measured_at,
    // Disclose the scope of the staleness check next to the value it qualifies.
    // STATE.md is session-volatile and the memory digest is never committed, so
    // neither can serve as a staleness signal -- but a reader of "current
    // occupancy" is entitled to know the check covers only CLAUDE.md.
    freshness_scope: src.freshness_scope || null,
    numerator_components: src.numerator_components || null,
  };

  // 무결성 위반(invalid)은 producer 부재(forward-only)보다 강한 신호이므로 먼저
  // 판정한다(A1 선례). 이 순서가 없으면 **손상된** 아티팩트가 `artifact_present`
  // false 하나로 뭉개져 "아직 안 만들었다"로 보고되고 `integrity_ok:true`까지
  // 달고 나간다 — source는 `degraded`/`error`로 손상을 구분하는데 소비자가 그
  // 구분을 버리는 것이다(부재·판독불가·손상은 서로 다른 사실이다).
  if (src.degraded || src.error) {
    return Object.assign({
      id: A3_INSTRUCTION_COST,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: false,
      invalid_reason: src.error || 'A3 source degraded',
      status: 'invalid',
      coverage: src.producer_coverage || 'unknown',
    }, coReport);
  }

  if (!src.artifact_present) {
    return Object.assign({
      id: A3_INSTRUCTION_COST,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: true,
      invalid_reason: 'no A3 artifact emitted yet (run: msw-metrics/cli.js a3 --emit ' + src.artifact_path + ')',
      status: 'forward-only',
      coverage: src.producer_coverage || 'unknown',
    }, coReport);
  }

  if (src.status !== 'computed') {
    return Object.assign(
      insufficientMetric(A3_INSTRUCTION_COST, 'A3 artifact status=' + (src.status || 'unknown')),
      coReport
    );
  }

  // A stale artifact still holds a real measurement, but it describes a tree
  // that no longer exists. Serving it as `computed` would be the confidently-
  // wrong shape this milestone exists to remove, so it degrades to insufficient
  // with the re-measure instruction attached.
  if (src.stale) {
    // Carry the staleness forward as its own flag. `insufficient` alone is
    // indistinguishable from "no baseline yet", and the surfaces downstream hide
    // that quietly -- but a measurement that EXISTS and has gone out of date is
    // an actionable instruction ("re-run --emit-after"), not an absence.
    return Object.assign(
      insufficientMetric(A3_INSTRUCTION_COST, src.stale_reason || 'A3 artifact is stale'),
      coReport,
      { stale: true, stale_reason: src.stale_reason || 'A3 artifact is stale' }
    );
  }

  const numerator = src.current_tokens;
  const denominator = src.denominator_tokens;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return Object.assign(
      insufficientMetric(A3_INSTRUCTION_COST, 'A3 artifact lacks usable token counts'),
      coReport
    );
  }

  return Object.assign({
    id: A3_INSTRUCTION_COST,
    numerator: numerator,
    denominator: denominator,
    value: numerator / denominator,
    integrity_ok: true,
    invalid_reason: null,
    status: 'computed',
    coverage: src.producer_coverage || 'unknown',
  }, coReport);
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
  // B2 concurrent conflicts — multi-session-work-loop M3 lifts the M2 downgrade,
  // but ONLY behind a falsifiable coverage gate.
  //
  // M2 downgraded B2 because production emitted just session_start/session_end,
  // so there was no live collision producer and a "computed 0%" would have been
  // confidently wrong. Crucially, M2 also refused to derive producer-presence
  // FROM observed collisions: that ties presence to collision_events_count>0 and
  // makes a legitimate computed-zero (a wired producer observing zero collisions
  // across N concurrent pairs) unreachable.
  //
  // M3 supplies the missing INDEPENDENT signal: `evidence_guard_active` is
  // emitted by every guarded receipt write, collision or not. So presence and
  // incident count are finally orthogonal.
  //
  // That alone is still self-attestation ("SOME guarded write happened"), not
  // proof that EVERY mutation path is covered — a missed writer would emit
  // neither guard_active nor overwrite_observed, and B2 would flip to
  // `computed 0/N` while an uncovered writer exists. So the flip is additionally
  // gated on `coverage_gate_ok`, whose PRIMARY axis is a runtime filesystem
  // mutation audit (b2-coverage-gate.js). Gate not passed → stay forward-only,
  // honestly.
  //
  // `prevented` is co-reported but NEVER in the numerator: counting blocked
  // races as incidents would make the metric worse the better the defense works.
  const sessionActivity = model.sources?.session_activity;
  if (!sessionActivity || !sessionActivity.ok) {
    return insufficientMetric(B2_CONCURRENT_CONFLICTS, 'session_activity source unavailable');
  }

  const concurrentPairs = sessionActivity.concurrent_pairs_count || 0;
  const producerPresent = !!sessionActivity.collision_producer_present;
  const gateOk = !!sessionActivity.coverage_gate_ok;
  const prevented = sessionActivity.conflict_prevented_count || 0;

  if (!producerPresent || !gateOk) {
    return {
      id: B2_CONCURRENT_CONFLICTS,
      numerator: null,
      denominator: concurrentPairs,
      value: null,
      integrity_ok: true,
      invalid_reason: !producerPresent
        ? 'no evidence_guard_active observed (collision producer not wired in this corpus)'
        : 'b2 coverage gate not passed (runtime mutation audit missing or found uncovered writes)',
      status: 'forward-only',
      coverage: sessionActivity.producer_coverage || 'unknown',
      conflicts_prevented: prevented,
    };
  }

  // 분모 0 → `insufficient`. 이 파일에서 `invalid`는 **무결성 위반**을 뜻한다
  // (A1의 unit spike·timestamp inversion, C1의 type separation violated) — 즉
  // 데이터가 서로 모순된다는 뜻이다. "동시 활동 쌍이 아직 없다"는 모순이 아니라
  // 데이터의 부재이고, 같은 파일 C1이 그 경우를 이미 `insufficient`로 표기한다
  // (`allFindings > 0 ? 'computed' : 'insufficient'`). `invalid`로 두면 겹치는
  // 세션이 없는 **1인 세션 저장소**(가장 흔한 구성)가 렌더러의 최우선 순위
  // 버킷에 무결성 위반으로 올라가 상시 오탐이 된다.
  if (concurrentPairs === 0) {
    return {
      id: B2_CONCURRENT_CONFLICTS,
      numerator: sessionActivity.overwrite_observed_count || 0,
      denominator: 0,
      value: null,
      integrity_ok: true,
      invalid_reason: 'no concurrent session pairs observed yet (denominator is zero)',
      status: 'insufficient',
      coverage: sessionActivity.producer_coverage || 'unknown',
      conflicts_prevented: prevented,
    };
  }

  const numerator = sessionActivity.overwrite_observed_count || 0;
  return {
    id: B2_CONCURRENT_CONFLICTS,
    numerator: numerator,
    denominator: concurrentPairs,
    value: numerator / concurrentPairs,
    integrity_ok: true,
    invalid_reason: null,
    status: 'computed',
    coverage: sessionActivity.producer_coverage || 'unknown',
    conflicts_prevented: prevented,
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

  // G3의 내용은 "제외는 규범 문서가 그 이름을 적을 때만 유효"다. 그 대조가
  // 어긋났거나 아예 불가능했다면 이 분모는 문서가 승인한 분모가 아니므로
  // 지표로 발행할 수 없다. source가 `degraded`로 표시해도 소비자가 읽지 않으면
  // drift난 분모가 `integrity_ok:true`를 달고 그대로 나간다 — 세 라운드에 걸쳐
  // 같은 층에서 반복된 결함이라 발행 지점에서 막는다.
  if (toggleUsage.exclusion_doc_ok !== true || toggleUsage.degraded) {
    const reason = toggleUsage.error
      || 'exclusion table drift — the denominator is not the one measurement-design.md §B3 names';
    return {
      id: B3_TOGGLE_AXES,
      numerator: null,
      denominator: null,
      value: null,
      integrity_ok: false,
      invalid_reason: reason,
      status: 'invalid',
      coverage: toggleUsage.producer_coverage || 'unknown',
    };
  }

  if (totalToggles === 0) {
    return insufficientMetric(B3_TOGGLE_AXES, 'no toggles in runtime surface');
  }

  // Co-reported alongside every B3 shape below. `raw_surface_count` next to
  // `denominator` is what stops a named exclusion from reading as a reduction:
  // the difference between the two IS the exclusion count, and M4 retired zero
  // toggles (measurement-design.md §B3, guarantee G3).
  const coReport = {
    operation_branches: operationBranchCount,
    operation_branch_method: toggleUsage.operation_branch_method || null,
    raw_surface_count: toggleUsage.raw_surface_count || null,
    excluded_count: toggleUsage.excluded_count || 0,
    // measurement-design.md §B3's integrity check is fold detection: "토글 수를
    // 줄였다"가 "동작 분기를 줄였다"와 다름을 병기가 드러낸다. That comparison
    // needs a PRIOR cycle's (toggle_count, branch_count) pair, which is not
    // recorded anywhere yet, so the check is honestly forward-only rather than
    // silently absent.
    //
    // M4 note: this replaced an `operation_branch_count > 100 → invalid` rule
    // that appears nowhere in the frozen contract. An absolute ceiling is not
    // fold detection — it just fires once the branch count is computed over the
    // real surface (199 today), which would have flipped B3 to `invalid` for
    // having correctly counted.
    branch_fold_check: 'forward-only (no prior-cycle toggle/branch pair recorded)',
  };

  // Producer presence is orthogonal to usage count (A1/B2 precedent). With zero
  // env-snapshot files the honest statement is "no usage history has ever been
  // collected", not "0% of toggles are used" — the latter is a finding, and
  // reporting it as `computed` on an empty corpus is the confidently-wrong
  // pattern M2 downgraded elsewhere. The producer was in fact never writing
  // (session-start.js resolved its snapshot path against cwd); M4 Task 6 starts
  // the clock, so this flips to `computed` once one session has run.
  if (!toggleUsage.snapshot_corpus_present) {
    return Object.assign({
      id: B3_TOGGLE_AXES,
      numerator: null,
      denominator: totalToggles,
      value: null,
      integrity_ok: true,
      invalid_reason: 'no env-snapshot corpus yet (toggle usage history is forward-only from M4 Task 6)',
      status: 'forward-only',
      coverage: toggleUsage.producer_coverage || 'unknown',
    }, coReport);
  }

  return Object.assign({
    id: B3_TOGGLE_AXES,
    numerator: usedToggleCount,
    denominator: totalToggles,
    value: usedToggleCount / totalToggles,
    integrity_ok: true,
    invalid_reason: null,
    status: 'computed',
    coverage: toggleUsage.producer_coverage || 'unknown',
  }, coReport);
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
  A3_INSTRUCTION_COST,
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
