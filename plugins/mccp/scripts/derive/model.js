'use strict';

// MODEL_VERSION stays 'v1' across all M1–M5 additive surface changes:
//   M2: briefing_summary / briefing_token_count / briefing_invocation_count
//   M3: (no change — render-only consumer)
//   M4: mask_hits / last_render_meta (top-level optional)
//   M5: receipts.items[].receipt_hash (optional)
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
    },
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
    const required = ['plans', 'receipts', 'state', 'backlog', 'fix_task', 'pr', 'envelopes'];
    for (const k of required) {
      if (!model.sources[k]) errors.push('sources.' + k + ' missing');
    }
    const countSources = ['plans', 'receipts', 'backlog', 'envelopes'];
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
  return { ok: errors.length === 0, errors: errors };
}

module.exports = {
  MODEL_VERSION,
  emptyModel,
  markDegraded,
  validateShape,
};
