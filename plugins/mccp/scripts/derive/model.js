'use strict';

// MODEL_VERSION stays 'v1' across all M1–M5 additive surface changes:
//   M2: briefing_summary / briefing_token_count / briefing_invocation_count
//   M3: (no change — render-only consumer)
//   M4: mask_hits / last_render_meta (top-level optional)
//   M5: receipts.items[].receipt_hash (optional)
//   dashboard-truthfulness M1: sources.ledger (additive count-source)
//   dashboard-truthfulness M2: host_version (additive top-level object)
//   dashboard-multi-session M1: sources.worktrees (additive count-source)
//   leadtime-observability M3: leadtime (additive top-level object OR null)
// Consumers MUST tolerate missing optional fields (null fallback). A bump
// would force receipt-side migration which the additive surface avoids.
const MODEL_VERSION = 'v1';

function emptyModel(repoRoot) {
  return {
    schema_version: MODEL_VERSION,
    derived_at: null,
    repo_root: repoRoot,
    masked: true,
    m0_capability: {
      contract_present: null,
      evidence: '',
    },
    sources: {
      plans:     { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      receipts:  { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      state:     { ok: true, item: null,                           degraded: false, error: null },
      backlog:   { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      fix_task:  { ok: true, item: null,                           degraded: false, error: null },
      pr:        { ok: true, item: null,                           degraded: false, error: null },
      envelopes: { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      ledger:    { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      // dashboard-multi-session M1 — live cross-worktree progress scanner.
      // Additive count-source; scanned/self_path/truncated are merged in by the
      // scanner at derive time (gate-off no-op leaves scanned:false).
      worktrees: { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
    },
    // dashboard-truthfulness M2 (Codex R1 F2) — host-project version signal,
    // stamped at derive time so the renderer never reads host files. additive
    // optional (MODEL_VERSION 'v1' unchanged).
    host_version: { version: null, source: 'unknown', latest_plan: null, degraded: false, error: null },
    // leadtime-observability M3 — 리드타임 분포 투영(top-level, additive optional).
    // `null` 은 "이 축이 계산되지 않았다" 이지 "측정했더니 0" 이 아니다 — 렌더는
    // 그 구분을 hide 로 지킨다(DD3). `leadtimeScan` 기본 off 라 bare derive 는 null.
    leadtime: null,
    correlations: [],
    warnings: [],
  };
}

function markDegraded(source, reason) {
  if (!source) return;
  source.degraded = true;
  if (typeof source.invalid_count === 'number') source.invalid_count += 1;
  if (reason && !source.error) source.error = reason;
}

function validateShape(model) {
  const errors = [];
  if (!model || typeof model !== 'object') {
    return { ok: false, errors: ['model is not an object'] };
  }
  if (model.schema_version !== MODEL_VERSION) errors.push('schema_version != ' + MODEL_VERSION);
  if (typeof model.repo_root !== 'string') errors.push('repo_root not a string');
  if (typeof model.masked !== 'boolean') errors.push('masked not a boolean');
  if (!model.m0_capability || typeof model.m0_capability !== 'object') {
    errors.push('m0_capability missing');
  }
  if (!model.sources || typeof model.sources !== 'object') {
    errors.push('sources missing');
  } else {
    const required = ['plans', 'receipts', 'state', 'backlog', 'fix_task', 'pr', 'envelopes', 'ledger', 'worktrees'];
    for (const k of required) {
      if (!model.sources[k]) errors.push('sources.' + k + ' missing');
    }
    const countSources = ['plans', 'receipts', 'backlog', 'envelopes', 'ledger', 'worktrees'];
    for (const k of countSources) {
      const s = model.sources[k];
      if (!s) continue;
      if (typeof s.count !== 'number') errors.push('sources.' + k + '.count not a number');
      if (!Array.isArray(s.items)) errors.push('sources.' + k + '.items not an array');
      if (typeof s.invalid_count !== 'number') errors.push('sources.' + k + '.invalid_count not a number');
      if (typeof s.degraded !== 'boolean') errors.push('sources.' + k + '.degraded not a boolean');
    }
    const itemSources = ['state', 'fix_task', 'pr'];
    for (const k of itemSources) {
      const s = model.sources[k];
      if (!s) continue;
      if (!('item' in s)) errors.push('sources.' + k + '.item missing');
      if (typeof s.degraded !== 'boolean') errors.push('sources.' + k + '.degraded not a boolean');
    }
  }
  if (!Array.isArray(model.correlations)) errors.push('correlations not an array');
  if (!Array.isArray(model.warnings)) errors.push('warnings not an array');
  // dashboard-truthfulness M2 — host_version present-only (additive optional).
  if ('host_version' in model) {
    const hv = model.host_version;
    if (!hv || typeof hv !== 'object') {
      errors.push('host_version present but not an object');
    } else {
      if (!('version' in hv)) errors.push('host_version.version missing');
      if (typeof hv.source !== 'string') errors.push('host_version.source not a string');
      if (typeof hv.degraded !== 'boolean') errors.push('host_version.degraded not a boolean');
    }
  }
  // leadtime-observability M3 — leadtime present-only. **선언된 `null` 을 허용한다**:
  // `emptyModel` 이 키를 항상 선언하므로 host_version 형태의 'present but not an
  // object' 를 그대로 쓰면 빈 모델이 자기 스키마에 걸린다.
  if ('leadtime' in model && model.leadtime !== null) {
    const lt = model.leadtime;
    if (!lt || typeof lt !== 'object') {
      errors.push('leadtime present but neither an object nor null');
    } else {
      if (typeof lt.state !== 'string') errors.push('leadtime.state not a string');
      if (!lt.coverage || typeof lt.coverage !== 'object') errors.push('leadtime.coverage missing');
      if (!('panel_span' in lt)) errors.push('leadtime.panel_span missing');
      const pps = lt.post_panel_span;
      if (!pps || typeof pps !== 'object') {
        errors.push('leadtime.post_panel_span missing');
      } else if (!pps.by_anchor || typeof pps.by_anchor !== 'object') {
        errors.push('leadtime.post_panel_span.by_anchor missing');
      } else {
        // 두 앵커 키는 언제나 실린다(부재는 null) — 조건부 키를 소비처가 물려받지 않는다.
        for (const k of ['ledger_basename', 'ship_plan_hash']) {
          if (!(k in pps.by_anchor)) errors.push('leadtime.post_panel_span.by_anchor.' + k + ' missing');
        }
      }
      if (!Array.isArray(lt.degradations)) errors.push('leadtime.degradations not an array');
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

module.exports = {
  MODEL_VERSION,
  emptyModel,
  markDegraded,
  validateShape,
};
